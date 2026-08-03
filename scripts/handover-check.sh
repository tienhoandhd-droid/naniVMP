#!/usr/bin/env bash
# =====================================================================
#  handover-check.sh — Người tiếp nhận tự kiểm tra hệ VMP trong ~1 phút.
#  Chạy:  bash scripts/handover-check.sh
#  Mỗi mục in ✅/❌ kèm cách sửa. Không ghi/sửa gì — chỉ đọc.
# =====================================================================
set -u
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok()   { echo "✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "❌ $1"; echo "   → $2"; FAIL=$((FAIL+1)); }

echo "== VMP handover check =="

# 1. Node/npm
if command -v npm >/dev/null 2>&1; then
  ok "npm có sẵn ($(node -v 2>/dev/null))"
else
  bad "Thiếu Node.js/npm" "Cài Node 18+ từ nodejs.org rồi chạy: npm install"
fi

# 2. File env frontend
if [ -f .env ]; then
  ok "Đã có .env (frontend)"
else
  bad "Chưa có .env" "Sao chép .env.example thành .env và điền VITE_SUPABASE_URL + VITE_SUPABASE_ANON"
fi

# 3. File env admin + kết nối DB
DB_OK=0
if [ -f .env.local ]; then
  # shellcheck disable=SC1091
  source .env.local
  if command -v psql >/dev/null 2>&1 && [ -n "${SUPABASE_DB_URL:-}" ]; then
    LAST_SYNC=$(psql "$SUPABASE_DB_URL" -tA -c "select coalesce(max(started_at)::text,'CHƯA CÓ') from vmp_sheet_sync_runs;" 2>/dev/null)
    if [ -n "$LAST_SYNC" ]; then
      ok "Kết nối Supabase OK — lần sync cuối: $LAST_SYNC"
      DB_OK=1
    else
      bad "Không kết nối được Supabase qua SUPABASE_DB_URL" "Kiểm tra chuỗi kết nối trong .env.local (xem .env.local.example)"
    fi
  else
    bad "Thiếu psql hoặc SUPABASE_DB_URL rỗng" "Cài postgresql client (brew install libpq) và điền .env.local"
  fi
else
  bad "Chưa có .env.local" "Sao chép .env.local.example thành .env.local, điền chuỗi kết nối nhận qua kênh an toàn"
fi

# 3b. Dữ liệu nghiệp vụ có mặt và nhất quán.
#
#     LƯU Ý ĐỔI KIẾN TRÚC (2026-07-29): Supabase nay là nơi lưu dữ liệu chính,
#     Google Sheet chỉ còn là bản sao lưu. Nhánh sync Sheet→Supabase của WF-04
#     đã TẮT CÓ CHỦ ĐÍCH, nên "sync đứng" không còn là lỗi — đo độ trễ sync ở
#     đây sẽ báo động giả mãi mãi. Thay bằng kiểm tra dữ liệu thực có tồn tại
#     và số liệu giữa danh mục nguồn với timeline vẫn khớp nhau.
if [ "$DB_OK" = "1" ]; then
  READ=$(psql "$SUPABASE_DB_URL" -tA -F'|' -c "
    select
      (select count(*) from public.vmp_plan_items where is_active),
      (select count(*) from public.vmp_objects),
      (select count(*) from public.vmp_source_objects where validate_flag = 'y' and is_active);
  " 2>/dev/null | tr -d '[:space:]')
  ITEMS=$(echo "$READ" | cut -d'|' -f1)
  OBJS=$(echo "$READ" | cut -d'|' -f2)
  SRC=$(echo "$READ" | cut -d'|' -f3)

  if [ -z "$ITEMS" ] || [ "$ITEMS" = "0" ]; then
    bad "Chưa có hạng mục thẩm định nào trong vmp_plan_items" \
        "Vào màn Danh mục nguồn → Sinh timeline, hoặc gọi rpc_generate_timeline(năm, true)"
  elif [ "$OBJS" = "$SRC" ]; then
    ok "Dữ liệu nhất quán: ${ITEMS} hạng mục · ${OBJS} đối tượng khớp ${SRC} danh mục có thẩm định"
  else
    bad "Lệch số liệu: ${OBJS} đối tượng timeline nhưng ${SRC} danh mục nguồn có 'Thẩm định = y'" \
        "Chạy lại Sinh timeline để bổ sung hạng mục cho các đối tượng mới thêm"
  fi
fi

# 3c. Không hàm rpc_* nào được có hai bản trùng tên.
#
#     Overload + tham số có DEFAULT = một yêu cầu thiếu tham số khớp CẢ HAI
#     bản, PostgREST trả PGRST203 và đường gọi từ web chết câm — trên màn chỉ
#     hiện một câu báo lỗi chung chung. Đã xảy ra HAI lần: rpc_update_progress
#     (31/07, làm đường ghi tiến độ chưa từng chạy được) và rpc_set_user_role
#     (03/08, làm nút Lưu màn Phân quyền chết). Migration 20260803050000 dựng
#     event trigger chặn ở tầng DB; đây là lưới thứ hai, để nếu chốt kia bị gỡ
#     thì vẫn có chỗ nhìn thấy.
if [ "$DB_OK" = "1" ]; then
  DUP=$(psql "$SUPABASE_DB_URL" -tA -c "
    select coalesce(string_agg(proname || ' (' || n || ' bản)', ', '), '') from (
      select p.proname, count(*) as n
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname like 'rpc\\_%'
      group by p.proname having count(*) > 1) t;" 2>/dev/null | tr -d '\n')
  GUARD=$(psql "$SUPABASE_DB_URL" -tA -c "
    select count(*) from pg_event_trigger where evtname = 'chan_overload_rpc_tg';" 2>/dev/null | tr -d '[:space:]')

  if [ -n "$DUP" ]; then
    bad "Hàm rpc_* bị overload: $DUP" \
        "PostgREST sẽ trả PGRST203, web gọi vào là chết câm. DROP bản cũ (xem migration 20260803050000)"
  elif [ "$GUARD" != "1" ]; then
    bad "Không còn event trigger chan_overload_rpc_tg" \
        "Chốt chặn overload đã bị gỡ. Áp lại migration 20260803050000"
  else
    ok "Không hàm rpc_* nào bị overload · chốt chặn chan_overload_rpc_tg đang bật"
  fi
fi

# 4. Google Sheet CSV công khai tải được (đường sync WF-04 dùng chính URL dạng này)
SHEET_CSV="https://docs.google.com/spreadsheets/d/1MPG6YbR6m-YrENqb8u7uS3O8RUYk7GCYuzQRbShtqP8/export?format=csv&gid=1252715724"
CSV_TMP=$(mktemp -t vmp-sheet.XXXXXX)
trap 'rm -f "$CSV_TMP"' EXIT
HTTP=$(curl -s -o "$CSV_TMP" -w '%{http_code}' -L --max-time 30 "$SHEET_CSV")
if [ "$HTTP" = "200" ]; then
  ok "Tải được CSV Google Sheet 6.Timeline VMP (HTTP 200)"

  # 4b. Sức khoẻ dữ liệu nguồn — bắt lỗi NGAY TẠI SHEET trước khi guard SQL chặn.
  #     Guard chỉ báo "9724 dòng ngoài khoảng 450..5000", dễ khiến người đọc tưởng
  #     phải nới ngưỡng. Thực chất cần biết tỉ lệ dòng/ID duy nhất.
  if command -v python3 >/dev/null 2>&1; then
    STATS=$(python3 - "$CSV_TMP" <<'PY' 2>/dev/null
import csv, sys, unicodedata
def norm(s): return unicodedata.normalize('NFC', (s or '').strip().lower())
rows = list(csv.reader(open(sys.argv[1], encoding='utf-8')))
if len(rows) < 2: print("0 0 0"); raise SystemExit
hdr = [norm(h) for h in rows[0]]
try: i = hdr.index('id thẩm định')
except ValueError: print("-1 -1 -1"); raise SystemExit
body = rows[1:]
ids = [r[i].strip() for r in body if i < len(r) and r[i].strip()]
print(len(body), len(set(ids)), len(ids))
PY
)
    set -- $STATS
    SRC_ROWS="${1:-0}"; UNIQ_IDS="${2:-0}"
    if [ "$SRC_ROWS" = "-1" ]; then
      bad "CSV Sheet thiếu cột 'ID thẩm định'" "Header Sheet đã đổi — WF-04 sẽ chết ở VMP_SYNC_HEADER_DRIFT"
    elif [ "$UNIQ_IDS" -gt 0 ]; then
      RATIO=$((SRC_ROWS * 10 / UNIQ_IDS))   # x10 để giữ 1 chữ số thập phân không cần bc
      if [ "$SRC_ROWS" -lt 450 ] || [ "$SRC_ROWS" -gt 5000 ]; then
        bad "Sheet có $SRC_ROWS dòng / $UNIQ_IDS ID duy nhất (lặp ${RATIO%?}.${RATIO#${RATIO%?}}x) — NGOÀI khoảng 450..5000" \
            "Guard SQL sẽ chặn sync. Nếu tỉ lệ lặp > 1.1x thì Sheet bị dán trùng — DỌN SHEET, đừng nới guard."
      elif [ "$RATIO" -gt 11 ]; then
        bad "Sheet có $SRC_ROWS dòng nhưng chỉ $UNIQ_IDS ID duy nhất (lặp ${RATIO%?}.${RATIO#${RATIO%?}}x)" \
            "Có dòng trùng bất thường; kiểm tra lại tab 6.Timeline VMP trước khi sync"
      else
        ok "Dữ liệu Sheet lành: $SRC_ROWS dòng / $UNIQ_IDS ID duy nhất"
      fi
    fi
  fi
else
  bad "Không tải được CSV Sheet (HTTP $HTTP)" "Kiểm tra quyền chia sẻ Sheet hoặc mạng; WF-04 cần tải được URL này"
fi

# 5. n8n instance sống
HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://n8n.cpc1hn.com/")
if [ "$HTTP" = "200" ] || [ "$HTTP" = "302" ]; then
  ok "n8n.cpc1hn.com truy cập được (HTTP $HTTP)"
else
  bad "n8n.cpc1hn.com không phản hồi (HTTP $HTTP)" "Kiểm tra server n8n; toàn bộ sync/cảnh báo chạy trên đó"
fi

echo
echo "== Kết quả: $PASS đạt, $FAIL lỗi =="
if [ "$FAIL" -eq 0 ]; then
  echo "Bước tiếp: npm install && npm run dev (dashboard), đọc docs/HANDOVER.md"
fi
exit "$FAIL"
