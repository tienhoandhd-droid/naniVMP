import { useMemo, useState } from "react";
import {
  CheckCircle2, ClipboardCheck, FileCheck2, Filter,
  RotateCcw, ShieldCheck, Users,
} from "lucide-react";

import { C, NUM, TEXT } from "../../constants/theme.ts";
import { DEPTS, DEPT_COLOR, DEPT_DEEP } from "../../constants/vmp.ts";
import { buildCompletionFlow } from "../../features/overview/analysisStudioModel.ts";
import { parseDepts } from "../../utils/helpers.ts";
import { Card, CardTitle, Sel, CauKetLuan } from "../ui/Primitives.tsx";

import type { CSSProperties, ReactNode } from "react";
import type { Activity } from "../../types/domain.ts";

/** Một nhóm trong bảng phân tích (theo bộ phận / người / loại...). */
interface Group {
  key: string;
  label: string;
  short?: string;
  deptId?: string;
}

/** Một dòng trong bảng phân tích: nhóm + các hạng mục + tỉ lệ hoàn thành. */
interface GroupRow {
  key: string;
  label: string;
  activities: Activity[];
  summary: Record<string, { done: number; total: number; rate: number }>;
  short?: string;
  deptId?: string;
  [k: string]: unknown;
}

const ACTIVE = (activity: Activity): boolean => (activity.state || "active") === "active";

const METRICS = [
  {
    id: "protocol",
    label: "Hoàn thành đề cương",
    short: "Đề cương",
    field: "tt_de_cuong",
    icon: ClipboardCheck,
    color: C.lav,
    text: C.lavText,
    soft: C.lavSoft,
  },
  {
    id: "validation",
    label: "Thẩm định thực tế",
    short: "Thực tế",
    field: "tt_tham_dinh",
    icon: ShieldCheck,
    color: C.sky,
    text: C.skyText,
    soft: C.skySoft,
  },
  {
    id: "report",
    label: "Hoàn thành hồ sơ",
    short: "Hồ sơ",
    field: "tt_bao_cao",
    icon: FileCheck2,
    // Hồng = nhận-diện giai đoạn (không mang nghĩa status). Cam/đỏ được dành
    // riêng cho trạng thái (đang/sắp · quá hạn) nhất quán toàn app.
    color: C.pink,
    text: C.pinkText,
    soft: C.pinkSoft,
  },
  {
    id: "vmp",
    label: "Hoàn thành VMP",
    short: "VMP",
    field: "tt_vmp",
    icon: CheckCircle2,
    color: C.mint,
    text: C.mintText,
    soft: C.mintSoft,
  },
];

const clean = (value: unknown): string => String(value == null ? "" : value).trim();

function splitPeople(value: unknown): string[] {
  return clean(value)
    .split(/\s*(?:,|;|\s+&\s+)\s*/)
    .map((name) => name.trim())
    .filter((name) => name && name !== "—");
}

function activityPeople(activity: Activity): string[] {
  const raw = activity._raw || {};
  const values = [activity.owner, raw.qa, raw.ns_khac, raw.secondary_owner, raw.owner_name];
  return [...new Set(values.flatMap(splitPeople))];
}

function deptMeta(deptId?: string) {
  return DEPTS.find((item) => item.id === deptId);
}

// precomputed: mảng mã bộ phận đã chuẩn hoá ở server (activity.depts /
// activity.exec_depts). Ưu tiên nó; chỉ regex raw khi RPC chưa trả (đường n8n).
function deptGroup(activity: Activity, rawField: string, precomputed?: unknown): Group[] {
  const raw = (activity._raw || {}) as Record<string, unknown>;
  const parsed: string[] = (Array.isArray(precomputed) && precomputed.length)
    ? (precomputed as string[])
    : parseDepts(raw[rawField]);
  if (parsed.length) return parsed.map((deptId) => {
    const dept = deptMeta(deptId);
    return {
      key: deptId,
      label: String(dept?.name || raw[rawField] || "Chưa xác định"),
      short: dept?.short || "—",
      deptId,
    };
  });
  return [];
}

function valueGroup(value: unknown, emptyLabel: string): Group[] {
  const label = clean(value);
  return [{ key: label ? label.toLocaleLowerCase("vi") : "unknown", label: label || emptyLabel }];
}

const DIMENSION_OPTIONS = [
  { id: "department", label: "Bộ phận quản lý", head: "Đơn vị" },
  { id: "person", label: "Người phụ trách", head: "Người phụ trách", multiNote: true },
  { id: "executionDepartment", label: "Bộ phận thực hiện", head: "Bộ phận thực hiện" },
  { id: "area", label: "Mã khu vực", head: "Mã khu vực" },
  { id: "line", label: "Line", head: "Line" },
];

function dimensionGroups(activity: Activity, dimension: string): Group[] {
  const raw = activity._raw || {};
  if (dimension === "department") {
    const groups = deptGroup(activity, "bo_phan_goc", activity.depts);
    if (groups.length) return groups;
    const dept = deptMeta(activity.dept);
    return [{
      key: activity.dept || "unknown",
      label: dept?.name || "Chưa xác định",
      short: dept?.short || "—",
      deptId: activity.dept,
    }];
  }
  if (dimension === "executionDepartment") {
    const groups = deptGroup(activity, "bo_phan_thuc_hien_goc", activity.exec_depts);
    return groups.length ? groups : [{ key: "unknown", label: "Chưa có dữ liệu", short: "—" }];
  }
  if (dimension === "area") return valueGroup(activity.area || raw.khu_vuc, "Chưa có khu vực");
  if (dimension === "line") return valueGroup(activity.line || raw.line, "Chưa có line");

  const people = activityPeople(activity);
  if (!people.length) return [{ key: "unassigned", label: "Chưa phân công" }];
  return people.map((person) => ({ key: person.toLocaleLowerCase("vi"), label: person }));
}

function completionSummary(activities: Activity[]) {
  return Object.fromEntries(buildCompletionFlow(activities).stages.map((stage) => [stage.id, {
    done: stage.done,
    total: stage.total,
    rate: stage.rate,
  }]));
}

function ProgressBar({ rate, color, height = 8 }: {
  rate: number; color: string; height?: number;
}) {
  const scale = Math.max(0, Math.min(rate, 100)) / 100;
  return (
    <div style={{ height, borderRadius: 999, background: C.pinkSoft, overflow: "hidden" }}>
      <div style={{
        width: "100%", height: "100%", borderRadius: 999, background: color,
        transform: `scaleX(${scale})`, transformOrigin: "left",
        transition: "transform var(--lp-motion-ui) var(--lp-ease)",
      }} />
    </div>
  );
}

function groupRows(activities: Activity[], dimension: string): GroupRow[] {
  const groups = new Map<string, {
    key: string; label: string; activities: Activity[]; [k: string]: unknown;
  }>();
  const add = (
    key: string,
    label: string,
    activity: Activity,
    meta: Record<string, unknown> = {},
  ): void => {
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { key, label, activities: [], ...meta });
    groups.get(key)!.activities.push(activity);
  };

  activities.filter(ACTIVE).forEach((activity) => {
    dimensionGroups(activity, dimension).forEach((group) => {
      add(group.key, group.label, activity, { ...group });
    });
  });

  return [...groups.values()]
    .map((group): GroupRow => ({
      ...group,
      summary: completionSummary(group.activities),
    }))
    .sort((a, b) => b.summary.vmp.rate - a.summary.vmp.rate
      || b.summary.validation.rate - a.summary.validation.rate
      || a.label.localeCompare(b.label, "vi"));
}

export function DimensionTable({ activities, dimension }: {
  activities: Activity[]; dimension: string;
}) {
  const rows = useMemo(() => groupRows(activities, dimension), [activities, dimension]);
  const activeDimension = DIMENSION_OPTIONS.find((item) => item.id === dimension) || DIMENSION_OPTIONS[0];
  const isExecutionDepartment = dimension === "executionDepartment";
  const title = isExecutionDepartment ? "Tiến độ theo bộ phận thực hiện" : "Tiến độ theo đơn vị phụ trách";
  const subtitle = isExecutionDepartment
    ? "Theo dõi tiến độ từng bộ phận qua 4 chỉ tiêu: đề cương, thực tế, hồ sơ, VMP"
    : `So sánh bốn mốc hoàn thành trên cùng một mẫu số · ${activeDimension.label.toLowerCase()}`;

  return (
    <Card variant="strong">
      <CardTitle level={3} icon={Users} sub={subtitle}>{title}</CardTitle>

      {rows.length ? (
        <div className="completion-table-scroll" style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            minWidth: isExecutionDepartment ? 650 : 720,
            borderCollapse: "separate",
            borderSpacing: "0 8px",
          }}>
            <caption className="lp-visually-hidden">So sánh tiến độ hoàn thành theo {activeDimension.label.toLowerCase()}</caption>
            <thead>
              <tr>
                <th scope="col" style={TH}>{activeDimension.head}</th>
                {!isExecutionDepartment && <th scope="col" style={TH}>Hạng mục</th>}
                {METRICS.map((metric) => <th key={metric.id} scope="col" style={TH}>{metric.short}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="vmp-row">
                  <th scope="row" style={{ ...TD, borderRadius: "14px 0 0 14px", minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {row.deptId ? (
                        <div style={{
                          width: 38, height: 38, borderRadius: 14, flexShrink: 0,
                          background: `${(DEPT_COLOR as Record<string, string>)[row.deptId] || C.lav}18`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: (DEPT_DEEP as Record<string, string>)[row.deptId] || C.lavText,
                          fontSize: 12, fontWeight: 800,
                        }}>
                          {row.short || "—"}
                        </div>
                      ) : (
                        <div style={{
                          width: 38, height: 38, borderRadius: 999, flexShrink: 0,
                          background: "linear-gradient(135deg,#C2497A,#6E54C0)", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: NUM, fontSize: 16, fontWeight: 800,
                        }}>
                          {(row.label === "Chưa có dữ liệu" ? "?" : row.label.charAt(0).toUpperCase()) || "?"}
                        </div>
                      )}
                      <span style={{ color: C.plum, fontSize: 14, fontWeight: 800 }}>{row.label}</span>
                    </div>
                  </th>
                  {!isExecutionDepartment && (
                    <td style={{ ...TD, fontFamily: NUM, fontSize: 14, fontWeight: 800, color: C.plum }}>
                      {row.activities.length}
                    </td>
                  )}
                  {METRICS.map((metric, index) => {
                    const value = row.summary[metric.id];
                    return (
                      <td key={metric.id} style={{
                        ...TD,
                        ...(index === METRICS.length - 1 ? { borderRadius: "0 14px 14px 0" } : {}),
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            minWidth: 38, fontFamily: NUM, fontSize: 14, fontWeight: 800,
                            color: metric.text,
                          }}>
                            {value.rate}%
                          </span>
                          <div style={{ flex: 1, minWidth: 42 }}>
                            <ProgressBar rate={value.rate} color={metric.color} height={6} />
                            {isExecutionDepartment && (
                              <div style={{
                                marginTop: 3,
                                fontFamily: TEXT,
                                fontSize: 12,
                                fontWeight: 800,
                                color: C.plumSoft,
                                whiteSpace: "nowrap",
                              }}>
                                {value.done}/{value.total}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 28, textAlign: "center", color: C.plumSoft, fontSize: 14, fontWeight: 700 }}>
          Không có hạng mục phù hợp với phạm vi đang chọn.
        </div>
      )}

      {activeDimension.multiNote && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.5 }}>
          Một hạng mục có nhiều người phụ trách được tính vào kết quả của từng người liên quan; vì vậy tổng số theo người có thể lớn hơn tổng hạng mục duy nhất.
        </div>
      )}
      {isExecutionDepartment && rows.some((row) => row.key !== "unknown") && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.5 }}>
          Dòng có nhiều bộ phận thực hiện, ví dụ “RD, QA, QC, XSX”, được tách và tính vào từng bộ phận riêng.
        </div>
      )}
      {dimension === "executionDepartment" && rows.length === 1 && rows[0].key === "unknown" && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.plumSoft, fontWeight: 600, lineHeight: 1.5 }}>
          Cần chạy migration read model và sync snapshot mới để lấy cột Sheet “Bộ phận thực hiện thẩm định” vào dashboard.
        </div>
      )}
    </Card>
  );
}

const TH: CSSProperties = {
  padding: "0 14px 6px", textAlign: "left", color: C.plumSoft,
  fontFamily: TEXT, fontSize: 12, fontWeight: 800, textTransform: "uppercase",
  letterSpacing: ".04em", whiteSpace: "nowrap",
};

const TD: CSSProperties = {
  padding: "11px 14px", background: C.surface, borderTop: `1px solid ${C.pinkSoft}`,
  borderBottom: `1px solid ${C.pinkSoft}`, color: C.plumSoft, fontSize: 12,
};

type ComparisonMode = "validationType" | (typeof DIMENSION_OPTIONS)[number]["id"];

export default function CompletionDashboard({ acts, matrix }: {
  acts: Activity[];
  matrix: ReactNode;
}) {
  const [department, setDepartment] = useState("all");
  const [validationType, setValidationType] = useState("all");
  const [person, setPerson] = useState("all");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("validationType");

  const activeActs = useMemo(() => acts.filter(ACTIVE), [acts]);
  const departmentActs = useMemo(
    () => department === "all" ? activeActs : activeActs.filter((activity) => activity.dept === department),
    [activeActs, department],
  );
  const validationTypes = useMemo(() => [...new Set(departmentActs
    .map((activity) => clean(activity.vtype).toUpperCase())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "vi")), [departmentActs]);
  const selectedType = validationType === "all" || validationTypes.includes(validationType) ? validationType : "all";
  const typeActs = useMemo(() => departmentActs.filter((activity) => (
    selectedType === "all" || clean(activity.vtype).toUpperCase() === selectedType
  )), [departmentActs, selectedType]);
  const people = useMemo(() => [...new Set(typeActs.flatMap(activityPeople))]
    .sort((a, b) => a.localeCompare(b, "vi")), [typeActs]);
  const selectedPerson = person === "all" || people.includes(person) ? person : "all";
  const scopedActs = useMemo(() => typeActs.filter((activity) => (
    selectedPerson === "all" || activityPeople(activity).includes(selectedPerson)
  )), [typeActs, selectedPerson]);
  const flow = useMemo(() => buildCompletionFlow(scopedActs), [scopedActs]);
  const summary = useMemo(() => completionSummary(scopedActs), [scopedActs]);

  const typeRows = useMemo(() => {
    const map = new Map();
    scopedActs.filter(ACTIVE).forEach((activity) => {
      const type = clean(activity.vtype).toUpperCase() || "CHƯA PHÂN LOẠI";
      if (!map.has(type)) map.set(type, []);
      map.get(type).push(activity);
    });
    return [...map.entries()].map(([type, items]) => ({
      type,
      total: items.length,
      done: completionSummary(items).vmp.done,
      rate: completionSummary(items).vmp.rate,
    })).sort((a, b) => b.total - a.total || a.type.localeCompare(b.type, "vi"));
  }, [scopedActs]);

  /* Phễu bốn giai đoạn: khâu tụt sâu nhất so với khâu liền trước là chỗ
     đang tắc. Bốn thẻ số cạnh nhau không tự nói ra điều đó — mắt phải trừ
     nhẩm bốn lần. */
  const klPheu = useMemo(() => {
    const buoc = METRICS.map((m) => ({ m, v: summary[m.id] as { done: number; total: number; rate: number } }));
    if (!buoc.length || !buoc[0].v?.total) return null;
    let hut = 0;
    for (let i = 1; i < buoc.length; i += 1) {
      if (buoc[i - 1].v.rate - buoc[i].v.rate > buoc[hut].v.rate - buoc[hut + 1].v.rate) hut = i - 1;
    }
    const rong = buoc[hut].v.rate - buoc[hut + 1].v.rate;
    const cuoi = buoc[buoc.length - 1].v;
    return {
      chinh: rong >= 8
        ? `Tắc nhất ở khâu ${buoc[hut].m.short} → ${buoc[hut + 1].m.short}: ${buoc[hut].v.rate}% xuống ${buoc[hut + 1].v.rate}%, mất ${rong} điểm.`
        : `Bốn giai đoạn đi đều nhau, chênh nhau nhiều nhất ${rong} điểm — không có khâu nào tắc riêng.`,
      phu: `Đích cuối: ${cuoi.done}/${cuoi.total} hạng mục đã hoàn thành VMP (${cuoi.rate}%).`,
      tone: (rong >= 25 ? "over" : rong >= 8 ? "warn" : "ok") as "over" | "warn" | "ok",
    };
  }, [summary]);

  /* So loại thẩm định: chỉ nêu loại tụt nhất và loại dẫn đầu — người xem
     cần biết đi hỏi ai, không cần đọc lại cả mười ô. */
  const klLoai = useMemo(() => {
    const co = typeRows.filter((r) => r.total >= 3);
    if (co.length < 2) return null;
    const xep = [...co].sort((a, b) => b.rate - a.rate);
    const dau = xep[0], cuoi = xep[xep.length - 1];
    return {
      chinh: `${cuoi.type} tụt xa nhất: ${cuoi.rate}% trên ${cuoi.total} hạng mục, kém ${dau.type} (${dau.rate}%) ${dau.rate - cuoi.rate} điểm.`,
      phu: "Chỉ so các loại có từ 3 hạng mục trở lên — dưới mức đó một hạng mục đã làm lệch tỉ lệ.",
      tone: (dau.rate - cuoi.rate >= 30 ? "warn" : "ok") as "warn" | "ok",
    };
  }, [typeRows]);

  const scopeLabel = [
    department === "all" ? "Tất cả bộ phận" : DEPTS.find((item) => item.id === department)?.name,
    selectedType === "all" ? "Tất cả loại thẩm định" : selectedType,
    selectedPerson === "all" ? "Tất cả người phụ trách" : selectedPerson,
  ].filter(Boolean).join(" · ");

  const resetFilters = () => {
    setDepartment("all");
    setValidationType("all");
    setPerson("all");
  };

  return (
    <div className="overview-analysis-stack">
      <section className="overview-analysis-layer overview-analysis-layer--flow"
        data-analysis-layer="flow" aria-labelledby="overview-analysis-flow-title">
        <div className="overview-analysis-layer__heading">
          <span className="overview-analysis-layer__index" aria-hidden="true">01</span>
          <div>
            <h3 id="overview-analysis-flow-title">Dòng chảy 4 giai đoạn</h3>
            <p>Đọc từ đề cương đến đích VMP để thấy bước nào đang làm hụt tiến độ.</p>
          </div>
        </div>

        <div className="analysis-filter-bar" aria-label="Lọc phân tích chuyên sâu">
          <div className="analysis-filter-bar__label">
            <Filter size={15} aria-hidden="true" />
            <span>Phạm vi phân tích</span>
          </div>
          <Sel
            val={department}
            nhan="Bộ phận trong phân tích chuyên sâu"
            set={(value) => { setDepartment(value); setValidationType("all"); setPerson("all"); }}
            opts={[{ v: "all", l: "Tất cả bộ phận" }, ...DEPTS.map((item) => ({ v: item.id, l: item.name }))]}
          />
          <Sel
            val={selectedType}
            nhan="Loại thẩm định trong phân tích chuyên sâu"
            set={(value) => { setValidationType(value); setPerson("all"); }}
            opts={[{ v: "all", l: "Tất cả loại thẩm định" }, ...validationTypes.map((type) => ({ v: type, l: type }))]}
          />
          <Sel
            val={selectedPerson}
            nhan="Người phụ trách trong phân tích chuyên sâu"
            set={setPerson}
            opts={[{ v: "all", l: "Tất cả người phụ trách" }, ...people.map((name) => ({ v: name, l: name }))]}
          />
          {(department !== "all" || selectedType !== "all" || selectedPerson !== "all") && (
            <button type="button" onClick={resetFilters} className="analysis-filter-bar__reset">
              <RotateCcw size={14} aria-hidden="true" /> Đặt lại
            </button>
          )}
        </div>

        <div className="analysis-scope-note">
          {scopeLabel} · <b>{scopedActs.length}</b> hạng mục
        </div>

        {klPheu && <CauKetLuan chinh={klPheu.chinh} phu={klPheu.phu} tone={klPheu.tone} />}

        <ol className="analysis-flow" data-analysis-flow>
          {flow.stages.map((stage, index) => {
            const metric = METRICS.find((item) => item.id === stage.id) || METRICS[0];
            const Icon = metric.icon;
            return (
              <li key={stage.id} className="analysis-flow__stage" data-analysis-stage={stage.id}>
                {index > 0 && (
                  <span className="analysis-flow__gap" data-analysis-gap>
                    {stage.deltaFromPrevious && stage.deltaFromPrevious < 0
                      ? `${stage.deltaFromPrevious} điểm`
                      : "Không giảm"}
                  </span>
                )}
                <div className="analysis-flow__stage-head">
                  <span className="analysis-flow__icon" style={{ color: metric.text, background: metric.soft }}>
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span>{stage.label}</span>
                </div>
                <strong>{stage.rate}%</strong>
                <small>{stage.done}/{stage.total} hoàn thành</small>
                <ProgressBar rate={stage.rate} color={metric.color} height={7} />
              </li>
            );
          })}
        </ol>
      </section>

      <div className="overview-analysis-layer overview-analysis-layer--matrix" data-analysis-layer="matrix">
        {matrix}
      </div>

      <section className="overview-analysis-layer overview-analysis-layer--comparison"
        data-analysis-layer="comparison" aria-labelledby="overview-analysis-comparison-title">
        <div className="overview-analysis-layer__heading">
          <span className="overview-analysis-layer__index" aria-hidden="true">03</span>
          <div>
            <h3 id="overview-analysis-comparison-title">So sánh cơ cấu</h3>
            <p>Mỗi lần chỉ xem một chiều để nhận ra nhóm đang dẫn đầu hoặc tụt lại.</p>
          </div>
        </div>

        <div className="analysis-comparison-switch" role="group" aria-label="Chọn chiều so sánh">
          <button type="button" aria-pressed={comparisonMode === "validationType"}
            onClick={() => setComparisonMode("validationType")}>Loại thẩm định</button>
          {DIMENSION_OPTIONS.map((option) => (
            <button key={option.id} type="button" aria-pressed={comparisonMode === option.id}
              onClick={() => setComparisonMode(option.id)}>{option.label}</button>
          ))}
        </div>

        <div data-analysis-comparison data-analysis-comparison-panel={comparisonMode}>
          {comparisonMode === "validationType" ? (
            <Card variant="strong">
              <CardTitle level={3} icon={ClipboardCheck} sub="Hoàn thành được xác định theo trạng thái VMP của từng hạng mục">
                Tỷ lệ hoàn thành từng loại thẩm định
              </CardTitle>
              {klLoai && <CauKetLuan chinh={klLoai.chinh} phu={klLoai.phu} tone={klLoai.tone} />}
              {typeRows.length ? (
                <div className="completion-type-grid">
                  {typeRows.map((row) => (
                    <div key={row.type} className="analysis-type-row">
                      <div>
                        <div className="analysis-type-row__head">
                          <div>
                            <b>{row.type}</b>
                            <small>{row.done}/{row.total} hoàn thành VMP</small>
                          </div>
                          <strong>{row.rate}%</strong>
                        </div>
                        <ProgressBar rate={row.rate} color={C.mint} height={8} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="analysis-empty">Không có loại thẩm định trong phạm vi đang chọn.</div>
              )}
            </Card>
          ) : (
            <DimensionTable activities={scopedActs} dimension={comparisonMode} />
          )}
        </div>
      </section>
    </div>
  );
}
