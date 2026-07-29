#!/usr/bin/env python3
"""
Nạp TOÀN BỘ tab của Google Sheet vào Supabase.

  · 5 tab danh mục  -> vmp_source_objects (canonical, đã khử trùng)
  · DM TDQTSX       -> vmp_products_gmp
  · mọi tab còn lại -> vmp_source_rows (thô, giữ nguyên vẹn)

    python3 scripts/import-source-catalogs.py            # nạp thật
    python3 scripts/import-source-catalogs.py --dry-run  # chỉ in SQL, không chạy

Chạy lại được nhiều lần: mỗi lần thay toàn bộ nội dung 3 bảng đích trong MỘT
transaction. Không đụng vmp_plan_items / vmp_sheet_rows (đường WF-04 lo tab 6).

Ánh xạ cột bám đúng node "Code in JavaScript1" của workflow VMP01 — đó mới là
luật chuẩn, không phải tab "0.Rule timeline VMP".

Cần: python3 -m pip install openpyxl   |   psql   |   SUPABASE_DB_URL trong .env.local
"""
import json
import os
import subprocess
import sys
import unicodedata
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SHEET_ID = "1MPG6YbR6m-YrENqb8u7uS3O8RUYk7GCYuzQRbShtqP8"
XLSX_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

# (tên tab, object_kind, cột mã, cột tên, cột khu vực, cột năm)
SOURCES = [
    ("1.DS thiết bị-All",       "Thiết bị",         "Mã thiết bị",    "Tên thiết bị",          "Mã khu vực",      "Năm nhập"),
    ("2. DS quy trình",         "Quy trình",        "Mã quy trình",   "Tên quy trình",         "Khu vực áp dụng", "Năm ban hành"),
    ("3. DS kho",               "Kho",              "Mã kho",         "Tên Kho",               "Mã khu vực",      None),
    ("4. DS hệ thốngc phụ trợ", "Hệ thống phụ trợ", "Mã hệ thống",    "Hệ thống phụ trợ",      "Mã khu vực",      "Năm nhập"),
    ("5. Vận chuyển",           "Vận chuyển",       "Mã vận chuyển",  "Tên chuyển vận chuyển", "Mã khu vực",      None),
]
PRODUCT_TAB = "DM TDQTSX show GMP"
PRODUCT_COLS = {
    "bfo_code": "Mã BFO",           "product_name": "Tên sản phẩm",
    "ingredients": "Thành phần",     "strength": "Hàm lượng",
    "production_line": "Line sản xuất", "dosage_form": "Dạng bào chế",
    "primary_pack": "Quy cách sơ cấp", "batch_size": "Cỡ lô chốt",
    "note": "NOTE",                  "mixing_tank": "Tank pha chế",
    "final_batch_size": "Cỡ lô chốt cuối (KH + QA)",
}
COMMON = {
    "department": "Bộ phận quản lý",   "line": "Line",
    "status": "Tình trạng",            "show_flag": "Show",
    "validate_flag": "Thẩm định",      "validate_reason": "Lý do thẩm định",
    "frequency_months": "Tần suất thẩm định (tháng)",
    "report_class": "Phân loại báo cáo",
    "workdays": "Số ngày công thẩm định thực tế",
    "critical_point": "Điểm trọng yếu",
    "first_month": "Tháng thẩm định đầu tiên trong năm",
}
INT_FIELDS = {"frequency_months", "workdays", "first_month", "year_ref"}
# VMP01 so sánh cờ thẩm định sau khi trim/lower/NFC ('Y' và 'y' đều tính là có).
# Chuẩn hoá về chữ thường khi lưu để truy vấn SQL khớp thẳng, khỏi phải lower() mọi nơi.
LOWER_FIELDS = {"validate_flag"}


def nfc(v):
    """Chuẩn hoá NFC + trim. Sheet hay trả tiếng Việt ở dạng NFD khi copy."""
    if v is None:
        return ""
    return unicodedata.normalize("NFC", str(v).strip())


def as_int(v):
    """Sheet trả số dạng float ('2013.0'); ép về int, hỏng thì trả None."""
    s = nfc(v)
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def q(v):
    """Escape literal cho SQL. None -> NULL, chuỗi rỗng -> NULL."""
    if v is None:
        return "NULL"
    if isinstance(v, int):
        return str(v)
    s = nfc(v)
    if not s:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def qjson(d):
    return "'" + json.dumps(d, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def read_tab(wb, name):
    """Trả (headers, [(row_number, {cột: giá trị})]). row_number tính cả header."""
    rows = list(wb[name].iter_rows(values_only=True))
    if not rows:
        return [], []
    headers = [nfc(c) for c in rows[0]]
    out = []
    for idx, r in enumerate(rows[1:], start=2):
        if not any(c is not None and str(c).strip() for c in r):
            continue
        rec = {headers[i]: r[i] for i in range(min(len(headers), len(r))) if headers[i]}
        out.append((idx, rec))
    return headers, out


def build_sql(wb):
    parts = ["BEGIN;",
             "TRUNCATE public.vmp_source_rows, public.vmp_source_objects, public.vmp_products_gmp;"]
    n_raw = n_obj = n_prod = 0
    skipped = []

    for tab, kind, c_code, c_name, c_area, c_year in SOURCES:
        _, rows = read_tab(wb, tab)
        mapped = dict(COMMON)
        used = set(mapped.values()) | {c_code, c_name, c_area} | ({c_year} if c_year else set())
        canonical = {}          # object_code -> câu VALUES (dòng SAU đè dòng trước)

        for rn, rec in rows:
            parts.append(
                f"INSERT INTO public.vmp_source_rows (source_tab,row_number,payload) "
                f"VALUES ({q(tab)},{rn},{qjson({k: nfc(v) for k, v in rec.items()})});")
            n_raw += 1

            code = nfc(rec.get(c_code))
            if not code:
                skipped.append(f"{tab} dòng {rn}: thiếu mã đối tượng")
                continue

            vals = {"object_kind": kind, "object_code": code,
                    "object_name": nfc(rec.get(c_name)) or None,
                    "area_code": nfc(rec.get(c_area)) or None,
                    "year_ref": as_int(rec.get(c_year)) if c_year else None,
                    "source_tab": tab, "source_row": rn}
            for field, col in COMMON.items():
                raw = rec.get(col)
                if field in INT_FIELDS:
                    vals[field] = as_int(raw)
                elif field in LOWER_FIELDS:
                    vals[field] = (nfc(raw).lower() or None)
                else:
                    vals[field] = (nfc(raw) or None)
            # first_month ngoài 1..12 sẽ vi phạm CHECK -> hạ về NULL, giữ giá trị gốc ở extra
            if vals["first_month"] is not None and not 1 <= vals["first_month"] <= 12:
                vals["first_month"] = None
            extra = {k: nfc(v) for k, v in rec.items() if k not in used and nfc(v)}

            cols = ("object_kind,object_code,object_name,department,area_code,line,status,"
                    "show_flag,validate_flag,validate_reason,frequency_months,report_class,"
                    "workdays,critical_point,first_month,year_ref,source_tab,source_row,extra")
            order = ["object_kind", "object_code", "object_name", "department", "area_code",
                     "line", "status", "show_flag", "validate_flag", "validate_reason",
                     "frequency_months", "report_class", "workdays", "critical_point",
                     "first_month", "year_ref", "source_tab", "source_row"]
            canonical[code] = (f"INSERT INTO public.vmp_source_objects ({cols}) VALUES ("
                               + ",".join(q(vals[k]) for k in order) + "," + qjson(extra) + ");")

        parts.extend(canonical.values())
        n_obj += len(canonical)

    # ---- sản phẩm GMP
    _, prows = read_tab(wb, PRODUCT_TAB)
    seen = {}
    for rn, rec in prows:
        parts.append(
            f"INSERT INTO public.vmp_source_rows (source_tab,row_number,payload) "
            f"VALUES ({q(PRODUCT_TAB)},{rn},{qjson({k: nfc(v) for k, v in rec.items()})});")
        n_raw += 1
        code = nfc(rec.get(PRODUCT_COLS["bfo_code"]))
        if not code:
            skipped.append(f"{PRODUCT_TAB} dòng {rn}: thiếu Mã BFO")
            continue
        extra = {k: nfc(v) for k, v in rec.items()
                 if k not in set(PRODUCT_COLS.values()) and nfc(v)}
        cols = ",".join(PRODUCT_COLS.keys()) + ",source_row,extra"
        vals = ",".join(q(rec.get(c)) for c in PRODUCT_COLS.values())
        seen[code] = f"INSERT INTO public.vmp_products_gmp ({cols}) VALUES ({vals},{rn},{qjson(extra)});"
    parts.extend(seen.values())
    n_prod = len(seen)

    # ---- MỌI TAB CÒN LẠI: đẩy thô để Supabase giữ đủ dữ liệu của workbook.
    #      Gồm: Giao việc · 0.Rule timeline VMP · Rule VMP state · Danh_sach_Email
    #           · CanhBao · Mail_Log_Index · Mail_Log · 6.Timeline VMP
    #      6.Timeline VMP đã có bản canonical ở vmp_plan_items; đẩy thêm bản thô
    #      để đối chiếu khi cần, không ảnh hưởng gì.
    done = {t for t, *_ in SOURCES} | {PRODUCT_TAB}
    n_other_tabs = 0
    for ws in wb.worksheets:
        if ws.title in done:
            continue
        _, rows = read_tab(wb, ws.title)
        if not rows:
            skipped.append(f"{ws.title}: tab rỗng, không có dòng nào")
            continue
        n_other_tabs += 1
        for rn, rec in rows:
            parts.append(
                f"INSERT INTO public.vmp_source_rows (source_tab,row_number,payload) "
                f"VALUES ({q(ws.title)},{rn},{qjson({k: nfc(v) for k, v in rec.items()})});")
            n_raw += 1

    parts.append("COMMIT;")
    return "\n".join(parts), n_raw, n_obj, n_prod, skipped, n_other_tabs


def main():
    dry = "--dry-run" in sys.argv
    try:
        import openpyxl
    except ImportError:
        sys.exit("Thiếu openpyxl. Cài: python3 -m pip install openpyxl")

    xlsx = REPO / ".cache-vmp-sheet.xlsx"
    print(f"Tải workbook từ Google Sheet ...")
    urllib.request.urlretrieve(XLSX_URL, xlsx)
    wb = openpyxl.load_workbook(xlsx, data_only=True)

    sql, n_raw, n_obj, n_prod, skipped, n_other = build_sql(wb)
    print(f"  dòng thô          : {n_raw}")
    print(f"  đối tượng canonical: {n_obj}")
    print(f"  sản phẩm GMP      : {n_prod}")
    print(f"  tab khác đẩy thô  : {n_other}")
    for s in skipped:
        print(f"  bỏ qua: {s}")

    if dry:
        out = REPO / "scratch-import.sql"
        out.write_text(sql, encoding="utf-8")
        print(f"\n--dry-run: đã ghi SQL ra {out}, KHÔNG chạy.")
        return

    db = os.environ.get("SUPABASE_DB_URL")
    if not db:
        envf = REPO / ".env.local"
        if envf.exists():
            for line in envf.read_text(encoding="utf-8").splitlines():
                if line.startswith("SUPABASE_DB_URL="):
                    db = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not db:
        sys.exit("Thiếu SUPABASE_DB_URL (đặt biến môi trường hoặc điền .env.local)")

    # ---- CHỐT CHẶN ----------------------------------------------------
    # Script này TRUNCATE rồi nạp lại từ Sheet. Từ khi dashboard cho nhập
    # liệu trực tiếp, chạy lại sẽ XOÁ SẠCH dữ liệu người dùng nhập trên web.
    # Cột edited_on_web do RPC rpc_upsert_source_object bật lên.
    chk = subprocess.run(
        ["psql", db, "-X", "-tA", "-c",
         "select count(*) from public.vmp_source_objects where edited_on_web"],
        text=True, capture_output=True)
    edited = chk.stdout.strip()
    if chk.returncode == 0 and edited.isdigit() and int(edited) > 0:
        if "--force" not in sys.argv:
            sys.exit(
                f"\nDỪNG: có {edited} bản ghi đã được sửa từ dashboard.\n"
                "Chạy tiếp sẽ TRUNCATE và xoá mất phần nhập tay đó.\n"
                "Google Sheet nay chỉ là nguồn tham chiếu — nhập liệu đã chuyển lên web.\n"
                "Nếu thật sự muốn nạp đè, chạy lại kèm --force.")
        print(f"\n--force: ghi đè {edited} bản ghi đã sửa từ dashboard.")

    print("\nNạp vào Supabase ...")
    p = subprocess.run(["psql", db, "-X", "-q", "-v", "ON_ERROR_STOP=1"],
                       input=sql, text=True, capture_output=True)
    if p.returncode != 0:
        sys.exit(f"LỖI:\n{p.stderr[:3000]}")
    print("Xong.")


if __name__ == "__main__":
    main()
