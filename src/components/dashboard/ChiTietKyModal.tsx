/* =====================================================================
 *  components/dashboard/ChiTietKyModal.tsx — Bấm vào con số, ra danh sách
 *  ---------------------------------------------------------------------
 *  Mọi ô số ở mục 1 của Báo cáo quản lý đều mở được hộp này. Con số 48
 *  "quá hạn đề cương" chỉ có ích khi biết ĐÓ LÀ 48 HẠNG MỤC NÀO — không
 *  thì người đọc lại phải sang trang khác lọc tay rồi tự đoán xem có
 *  cùng một tập hợp không.
 *
 *  Luật đếm ở đây phải KHỚP TUYỆT ĐỐI với stageTally/docTally/tally bên
 *  helpers, nếu không thì bấm vào ô "12" lại ra 11 dòng — mất tin ngay.
 *  Vì vậy cột hạn của "Hồ sơ" cũng lùi về dl_vmp đúng như docTally.
 * ===================================================================== */
import { useMemo, useState } from "react";
import { ListFilter, Download } from "lucide-react";

import { C, TEXT, NUM } from "../../constants/theme.ts";
import { Tag, TableScroll } from "../ui/Primitives.tsx";
import ViewportDialog from "../ui/ViewportDialog.tsx";
import { parseD, fmtVN, wlIsDone, nguoiPhuTrach, txt, download } from "../../utils/helpers.ts";
import { vmpToday } from "../../constants/vmp.ts";
import type { Activity } from "../../types/domain.ts";

/** Giai đoạn đang soi. `null` = xem cả hạng mục, không nhấn giai đoạn nào. */
export type GiaiDoan = "de_cuong" | "tham_dinh" | "ho_so" | "vmp" | null;

interface GdSpec {
  label: string;
  tt: string;
  dl: string;
  /** Cột hạn dự phòng — chỉ "Hồ sơ" có, để khớp docTally. */
  dlLui?: string;
  ngay: string;
}

const GD: Record<Exclude<GiaiDoan, null>, GdSpec> = {
  de_cuong:  { label: "Đề cương",           tt: "tt_de_cuong",  dl: "dl_de_cuong",  ngay: "ngay_de_cuong" },
  tham_dinh: { label: "Thẩm định thực tế",  tt: "tt_tham_dinh", dl: "dl_tham_dinh", ngay: "ngay_tham_dinh" },
  ho_so:     { label: "Hồ sơ",              tt: "tt_bao_cao",   dl: "dl_bao_cao", dlLui: "dl_vmp", ngay: "ngay_bao_cao" },
  vmp:       { label: "Hoàn thành VMP",     tt: "tt_vmp",       dl: "dl_vmp",       ngay: "ngay_vmp" },
};

type Loc = "all" | "done" | "over" | "todo";

const raw = (a: Activity) => (a._raw || {}) as Record<string, unknown>;

function hanCua(a: Activity, g: GdSpec): Date | null {
  const r = raw(a);
  return parseD(r[g.dl] as string) || (g.dlLui ? parseD(r[g.dlLui] as string) : null);
}

const th: React.CSSProperties = { textAlign: "left", fontSize: 12, color: C.plumSoft, fontWeight: 800, padding: "0 11px 9px", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 11px", fontSize: 12, color: C.plum, fontWeight: 600, borderTop: `1px solid ${C.line}` };

export default function ChiTietKyModal({ title, sub, rows, giaiDoan, onClose }: {
  title: string;
  sub?: string;
  rows: Activity[];
  giaiDoan?: GiaiDoan;
  onClose: () => void;
}) {
  const [loc, setLoc] = useState<Loc>("all");
  const g = giaiDoan ? GD[giaiDoan] : null;
  const homNay = vmpToday();

  /** Xong / quá hạn / chưa tới hạn — tính đúng như ô số đã hiện. */
  const phanLoai = useMemo(() => {
    if (!g) return null;
    const done: Activity[] = [], over: Activity[] = [], todo: Activity[] = [];
    for (const a of rows) {
      if (wlIsDone(raw(a)[g.tt])) { done.push(a); continue; }
      const dl = hanCua(a, g);
      if (dl && dl < homNay) over.push(a); else todo.push(a);
    }
    return { done, over, todo };
  }, [rows, g, homNay]);

  const hienThi = useMemo(() => {
    if (!phanLoai || loc === "all") return rows;
    return phanLoai[loc];
  }, [rows, phanLoai, loc]);

  const chip = (id: Loc, nhan: string, n: number, mau: string, nen: string) => (
    <button key={id} type="button" onClick={() => setLoc(id)}
      style={{
        fontFamily: TEXT, fontSize: 12, fontWeight: 800, cursor: "pointer",
        border: loc === id ? `2px solid ${mau}` : `1.5px solid ${C.pinkSoft}`,
        background: loc === id ? nen : C.surface, color: loc === id ? mau : C.plumSoft,
        borderRadius: 999, padding: "7px 14px",
      }}>
      {nhan} ({n})
    </button>
  );

  const xuatCsv = () => {
    const cot = ["Mã", "Tên hạng mục", "Loại", "Bộ phận", "Người thực hiện", "Trọng yếu",
      "Hạn đề cương", "Hạn thẩm định", "Hạn báo cáo", "Hạn đích VMP",
      "TT đề cương", "TT thẩm định", "TT báo cáo", "TT VMP"];
    const o = (v: unknown) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const dong = hienThi.map((a) => {
      const r = raw(a);
      return [a.code || a.id, a.name, a.vtype, txt(a.dept), nguoiPhuTrach(a.owner), a.crit,
        r.dl_de_cuong, r.dl_tham_dinh, r.dl_bao_cao, r.dl_vmp,
        r.tt_de_cuong_goc ?? r.tt_de_cuong, r.tt_tham_dinh_goc ?? r.tt_tham_dinh,
        r.tt_bao_cao_goc ?? r.tt_bao_cao, r.tt_vmp_goc ?? r.tt_vmp].map(o).join(";");
    });
    // BOM + dấu ; để Excel bản tiếng Việt mở đúng cột và đúng dấu.
    download(`ChiTiet_${title.replace(/[^0-9A-Za-z]+/g, "-").slice(0, 40)}.csv`,
      "﻿" + [cot.map(o).join(";"), ...dong].join("\r\n"));
  };

  return (
    <ViewportDialog open onRequestClose={() => onClose()} maxWidth={620} icon={ListFilter} title={title}
      footer={(
        <button type="button" onClick={onClose} style={{ fontFamily: TEXT, fontSize: 14, fontWeight: 800, color: C.plumSoft,
          background: C.surface, border: `1.5px solid ${C.pinkSoft}`, borderRadius: 14, padding: "11px 18px", cursor: "pointer" }}>
          Đóng
        </button>
      )}>
      {sub && <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, marginBottom: 12, lineHeight: 1.65 }}>{sub}</div>}

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {phanLoai ? (
          <>
            {chip("all", "Tất cả", rows.length, C.plum, C.pinkSoft)}
            {chip("done", `Đã xong ${g!.label.toLowerCase()}`, phanLoai.done.length, C.mintText, C.mintSoft)}
            {chip("over", "Quá hạn", phanLoai.over.length, C.raspText, C.raspSoft)}
            {chip("todo", "Chưa tới hạn", phanLoai.todo.length, C.plumSoft, C.pinkMist)}
          </>
        ) : (
          <Tag color={C.plum} bg={C.pinkSoft}>{rows.length} hạng mục</Tag>
        )}
        <button type="button" onClick={xuatCsv} disabled={!hienThi.length}
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7,
            fontFamily: TEXT, fontSize: 12, fontWeight: 800, color: C.mintText, background: C.mintSoft,
            border: "none", borderRadius: 999, padding: "8px 15px",
            cursor: hienThi.length ? "pointer" : "not-allowed", opacity: hienThi.length ? 1 : 0.5 }}>
          <Download size={14} /> Xuất CSV ({hienThi.length})
        </button>
      </div>

      <TableScroll maxHeight="52vh">
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: TEXT, minWidth: 820 }}>
          <thead>
            <tr>
              <th style={th}>Mã</th>
              <th style={th}>Tên hạng mục</th>
              <th style={th}>Bộ phận</th>
              <th style={th}>Người thực hiện</th>
              {g && <th style={th}>Hạn {g.label.toLowerCase()}</th>}
              {g && <th style={th}>Ngày thực tế</th>}
              <th style={th}>Trạng thái {g ? g.label.toLowerCase() : "VMP"}</th>
              {!g && <th style={th}>Hạn đích VMP</th>}
            </tr>
          </thead>
          <tbody>
            {hienThi.map((a) => {
              const r = raw(a);
              const spec = g || GD.vmp;
              const dl = hanCua(a, spec);
              const xong = wlIsDone(r[spec.tt]);
              const tre = !xong && dl && dl < homNay;
              const ngayTt = parseD(r[spec.ngay] as string);
              return (
                <tr key={a.id}>
                  <td style={{ ...td, fontFamily: NUM, whiteSpace: "nowrap" }}>{a.code || a.id}</td>
                  <td style={td}>{a.name}</td>
                  <td style={td}>{txt(a.dept)}</td>
                  <td style={td}>{nguoiPhuTrach(a.owner)}</td>
                  {g && <td style={{ ...td, fontFamily: NUM, whiteSpace: "nowrap" }}>{dl ? fmtVN(dl) : "—"}</td>}
                  {g && <td style={{ ...td, fontFamily: NUM, whiteSpace: "nowrap" }}>{ngayTt ? fmtVN(ngayTt) : "—"}</td>}
                  <td style={td}>
                    {xong ? <Tag color={C.mintText} bg={C.mintSoft}>Đã xong</Tag>
                      : tre ? <Tag color={C.raspText} bg={C.raspSoft}>Trễ {Math.round((homNay.getTime() - dl!.getTime()) / 86400000)} ngày</Tag>
                        : <Tag color={C.plumSoft} bg={C.pinkMist}>Chưa xong</Tag>}
                  </td>
                  {!g && <td style={{ ...td, fontFamily: NUM, whiteSpace: "nowrap" }}>{parseD(r.dl_vmp as string) ? fmtVN(parseD(r.dl_vmp as string)!) : "—"}</td>}
                </tr>
              );
            })}
            {!hienThi.length && (
              <tr><td style={{ ...td, textAlign: "center", color: C.plumSoft, padding: 26 }} colSpan={8}>
                Không có hạng mục nào trong nhóm này.
              </td></tr>
            )}
          </tbody>
        </table>
      </TableScroll>

      <div style={{ marginTop: 12, fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.65 }}>
        Danh sách này lấy đúng tập hạng mục đã tạo ra con số bạn vừa bấm — cùng bộ lọc, cùng kỳ.
        &quot;Trễ&quot; tính theo hạn của chính giai đoạn đang xem, không phải hạn đích VMP.
      </div>
    </ViewportDialog>
  );
}
