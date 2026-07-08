import { useMemo, useState } from "react";
import {
  BarChart3, CheckCircle2, ClipboardCheck, FileCheck2, Filter,
  RotateCcw, ShieldCheck, Users,
} from "lucide-react";

import { C, NUM, TEXT } from "../../constants/theme.js";
import { DEPTS, DEPT_COLOR, DEPT_DEEP } from "../../constants/vmp.js";
import { parseDepts, wlIsDone } from "../../utils/helpers.js";
import { Card, CardTitle, Sel } from "../ui/Primitives.jsx";

const ACTIVE = (activity) => (activity.state || "active") === "active";

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

const clean = (value) => String(value == null ? "" : value).trim();

function splitPeople(value) {
  return clean(value)
    .split(/\s*(?:,|;|\s+&\s+)\s*/)
    .map((name) => name.trim())
    .filter((name) => name && name !== "—");
}

function activityPeople(activity) {
  const raw = activity._raw || {};
  const values = [activity.owner, raw.qa, raw.ns_khac, raw.secondary_owner, raw.owner_name];
  return [...new Set(values.flatMap(splitPeople))];
}

function deptMeta(deptId) {
  return DEPTS.find((item) => item.id === deptId);
}

function deptGroup(activity, rawField) {
  const raw = activity._raw || {};
  const parsed = parseDepts(raw[rawField]);
  if (parsed.length) return parsed.map((deptId) => {
    const dept = deptMeta(deptId);
    return {
      key: deptId,
      label: dept?.name || raw[rawField] || "Chưa xác định",
      short: dept?.short || "—",
      deptId,
    };
  });
  return [];
}

function valueGroup(value, emptyLabel) {
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

function dimensionGroups(activity, dimension) {
  const raw = activity._raw || {};
  if (dimension === "department") {
    const groups = deptGroup(activity, "bo_phan_goc");
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
    const groups = deptGroup(activity, "bo_phan_thuc_hien_goc");
    return groups.length ? groups : [{ key: "unknown", label: "Chưa có dữ liệu", short: "—" }];
  }
  if (dimension === "area") return valueGroup(activity.area || raw.khu_vuc, "Chưa có khu vực");
  if (dimension === "line") return valueGroup(activity.line || raw.line, "Chưa có line");

  const people = activityPeople(activity);
  if (!people.length) return [{ key: "unassigned", label: "Chưa phân công" }];
  return people.map((person) => ({ key: person.toLocaleLowerCase("vi"), label: person }));
}

function isMetricDone(activity, metric) {
  const raw = activity._raw || {};
  if (metric.id === "vmp" && activity.st === "done") return true;
  return wlIsDone(raw[metric.field]);
}

function completionSummary(activities) {
  const active = activities.filter(ACTIVE);
  const total = active.length;
  return Object.fromEntries(METRICS.map((metric) => {
    const done = active.filter((activity) => isMetricDone(activity, metric)).length;
    return [metric.id, {
      done,
      total,
      rate: total ? Math.round((done / total) * 100) : 0,
    }];
  }));
}

/* ============================================================
 * Trạng thái theo 4 giai đoạn — LẤY ĐÚNG CHỮ trong cột Sheet
 * (không suy diễn theo deadline). Đếm theo ID thẩm định duy nhất.
 * Ô trạng thái trống → nhóm "Chưa điền thông tin".
 * ============================================================ */
const EMPTY_LABEL = "Chưa điền thông tin";

// field = chữ GỐC tiếng Việt từ Sheet (RPC trả *_goc); fallback = enum đã map.
const STATUS_DIMS = [
  { id: "vmp", label: "Trạng thái VMP", field: "tt_vmp_goc", fallback: "tt_vmp" },
  { id: "dc", label: "Trạng thái đề cương", field: "tt_de_cuong_goc", fallback: "tt_de_cuong" },
  { id: "td", label: "Thẩm định thực tế", field: "tt_tham_dinh_goc", fallback: "tt_tham_dinh" },
  { id: "bc", label: "Trạng thái báo cáo", field: "tt_bao_cao_goc", fallback: "tt_bao_cao" },
];

// Supabase chuẩn hoá trạng thái Sheet thành enum; đổi về nhãn tiếng Việt để hiển thị.
// Nếu ô đã là chữ gốc tiếng Việt (đường khác) thì giữ nguyên.
const ENUM_LABEL = {
  not_started: "Chưa thực hiện",
  in_progress: "Đang thực hiện",
  completed: "Hoàn thành",
  overdue: "Quá hạn",
};

// Màu theo ngữ nghĩa chữ trạng thái (nhận diện tiếng Việt). Thứ tự có chủ đích:
// xét phủ định ("chưa/không") TRƯỚC để "Chưa tiến hành" không bị bắt nhầm là "đang".
function statusTone(label) {
  if (label === EMPTY_LABEL) return C.plumSoft;
  const x = label.toLowerCase();
  if (/quá hạn|overdue/.test(x)) return C.raspText;
  if (/không\s*(tiến hành|thực hiện)/.test(x)) return C.plumSoft;   // bỏ/không làm → xám
  if (/chưa|chờ|pending/.test(x)) return C.skyText;                 // chưa/chờ xử lý
  if (/hoàn thành|hoàn thiện|đạt|xong|done/.test(x) && !/đang/.test(x)) return C.mintText;
  if (/tạm ngưng|tạm dừng|tạm hoãn|hoãn|ngưng/.test(x)) return C.lavText;
  if (/đang|bổ sung|tiến hành|làm|progress/.test(x)) return C.marigoldText;
  return C.pinkText;
}

// Phân bố trạng thái theo chữ trong cột, đếm theo ID thẩm định duy nhất.
function statusDistribution(activities, field, fallback) {
  const seen = new Set();
  const counts = new Map();
  let total = 0;
  for (const activity of activities) {
    const id = clean(activity.id);
    if (!id || seen.has(id)) continue; // mã duy nhất = ID thẩm định
    seen.add(id);
    total += 1;
    const raw = activity._raw || {};
    let value = clean(raw[field]); // ưu tiên chữ gốc *_goc
    if ((value === "" || value === "—") && fallback) value = clean(raw[fallback]); // fallback enum
    if (value === "" || value === "—") value = EMPTY_LABEL; // chưa điền → nhóm riêng
    else value = ENUM_LABEL[value] || value; // enum -> nhãn VN; chữ gốc giữ nguyên
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([label, count]) => ({ label, count, rate: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => {
      if (a.label === EMPTY_LABEL) return 1; // "Chưa điền thông tin" xuống cuối
      if (b.label === EMPTY_LABEL) return -1;
      return b.count - a.count || a.label.localeCompare(b.label, "vi");
    });
  return { rows, total };
}

function StatusBreakdown({ acts }) {
  const [dim, setDim] = useState("vmp");
  const active = STATUS_DIMS.find((item) => item.id === dim) || STATUS_DIMS[0];
  const { rows, total } = useMemo(
    () => statusDistribution(acts, active.field, active.fallback),
    [acts, active.field, active.fallback],
  );

  return (
    <Card variant="strong">
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 14, flexWrap: "wrap", marginBottom: 16,
      }}>
        <CardTitle icon={ClipboardCheck} sub={`Đếm theo ID thẩm định duy nhất · ${total} hạng mục · lấy đúng chữ trong cột, không suy diễn`}>
          Trạng thái theo 4 giai đoạn
        </CardTitle>
        <div style={{
          display: "inline-flex", gap: 4, padding: 4, borderRadius: 12,
          background: C.pinkMist, border: `1px solid ${C.pinkSoft}`, flexWrap: "wrap",
        }}>
          {STATUS_DIMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDim(item.id)}
              aria-pressed={dim === item.id}
              style={{
                border: "none", borderRadius: 9, padding: "8px 12px", cursor: "pointer",
                fontFamily: TEXT, fontSize: 12, fontWeight: 800,
                color: dim === item.id ? "#fff" : C.plumSoft,
                background: dim === item.id ? C.plum : "transparent",
                boxShadow: dim === item.id ? "0 4px 12px rgba(78,42,78,.18)" : "none",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((row) => {
            const tone = statusTone(row.label);
            return (
              <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 190, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: tone, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: row.label === EMPTY_LABEL ? C.plumSoft : C.plum }}>
                    {row.label}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 60 }}>
                  <div style={{ height: 10, borderRadius: 999, background: C.pinkMist, overflow: "hidden" }}>
                    <div style={{
                      width: `${row.rate}%`, height: "100%", borderRadius: 999, background: tone,
                      transition: "width .55s cubic-bezier(.22,1,.36,1)",
                    }} />
                  </div>
                </div>
                <div style={{ minWidth: 88, textAlign: "right", fontFamily: NUM, fontSize: 13, fontWeight: 800, color: tone }}>
                  {row.count} <span style={{ color: C.plumSoft, fontWeight: 700 }}>· {row.rate}%</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: 28, textAlign: "center", color: C.plumSoft, fontSize: 13, fontWeight: 700 }}>
          Không có dữ liệu trạng thái.
        </div>
      )}
    </Card>
  );
}

function ProgressBar({ rate, color, height = 8 }) {
  return (
    <div style={{ height, borderRadius: 999, background: C.pinkSoft, overflow: "hidden" }}>
      <div style={{
        width: `${rate}%`, height: "100%", borderRadius: 999, background: color,
        transition: "width .55s cubic-bezier(.22,1,.36,1)",
      }} />
    </div>
  );
}

function MetricCard({ metric, value }) {
  const Icon = metric.icon;
  return (
    <div style={{
      minWidth: 0, padding: "17px 18px", borderRadius: 18,
      background: `linear-gradient(145deg,#fff,${metric.soft})`,
      border: `1px solid ${metric.color}33`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12, background: metric.soft,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={19} color={metric.text} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.plum, lineHeight: 1.25 }}>{metric.label}</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.plumSoft, marginTop: 2 }}>
            {value.done}/{value.total} hạng mục
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <span style={{ fontFamily: NUM, fontSize: 31, fontWeight: 800, color: metric.text, lineHeight: 1 }}>
          {value.rate}%
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: C.plumSoft }}>HOÀN THÀNH</span>
      </div>
      <ProgressBar rate={value.rate} color={metric.color} />
    </div>
  );
}

function groupRows(activities, dimension) {
  const groups = new Map();
  const add = (key, label, activity, meta = {}) => {
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { key, label, activities: [], ...meta });
    groups.get(key).activities.push(activity);
  };

  activities.filter(ACTIVE).forEach((activity) => {
    dimensionGroups(activity, dimension).forEach((group) => {
      add(group.key, group.label, activity, group);
    });
  });

  return [...groups.values()]
    .map((group) => ({ ...group, summary: completionSummary(group.activities) }))
    .sort((a, b) => b.summary.vmp.rate - a.summary.vmp.rate
      || b.summary.validation.rate - a.summary.validation.rate
      || a.label.localeCompare(b.label, "vi"));
}

function DimensionTable({ activities, dimension, setDimension }) {
  const rows = useMemo(() => groupRows(activities, dimension), [activities, dimension]);
  const activeDimension = DIMENSION_OPTIONS.find((item) => item.id === dimension) || DIMENSION_OPTIONS[0];
  const isExecutionDepartment = dimension === "executionDepartment";
  const title = isExecutionDepartment ? "Tiến độ theo bộ phận thực hiện" : "Tiến độ theo đơn vị phụ trách";
  const subtitle = isExecutionDepartment
    ? "Theo dõi tiến độ từng bộ phận qua 4 chỉ tiêu: đề cương, thực tế, hồ sơ, VMP"
    : `So sánh bốn mốc hoàn thành trên cùng một mẫu số · ${activeDimension.label.toLowerCase()}`;

  return (
    <Card variant="strong">
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 14, flexWrap: "wrap", marginBottom: 18,
      }}>
        <CardTitle icon={Users} sub={subtitle}>
          {title}
        </CardTitle>
        <div style={{
          display: "inline-flex", gap: 4, padding: 4, borderRadius: 12,
          background: C.pinkMist, border: `1px solid ${C.pinkSoft}`, flexWrap: "wrap",
        }}>
          {DIMENSION_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setDimension(option.id)}
              aria-pressed={dimension === option.id}
              style={{
                border: "none", borderRadius: 9, padding: "8px 10px", cursor: "pointer",
                fontFamily: TEXT, fontSize: 12, fontWeight: 800,
                color: dimension === option.id ? "#fff" : C.plumSoft,
                background: dimension === option.id ? C.plum : "transparent",
                boxShadow: dimension === option.id ? "0 4px 12px rgba(78,42,78,.18)" : "none",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length ? (
        <div className="completion-table-scroll" style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            minWidth: isExecutionDepartment ? 650 : 720,
            borderCollapse: "separate",
            borderSpacing: "0 8px",
          }}>
            <thead>
              <tr>
                <th style={TH}>{activeDimension.head}</th>
                {!isExecutionDepartment && <th style={TH}>Hạng mục</th>}
                {METRICS.map((metric) => <th key={metric.id} style={TH}>{metric.short}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="vmp-row">
                  <td style={{ ...TD, borderRadius: "14px 0 0 14px", minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {row.deptId ? (
                        <div style={{
                          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                          background: `${DEPT_COLOR[row.deptId] || C.lav}18`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: DEPT_DEEP[row.deptId] || C.lavText, fontSize: 11, fontWeight: 800,
                        }}>
                          {row.short || "—"}
                        </div>
                      ) : (
                        <div style={{
                          width: 38, height: 38, borderRadius: 999, flexShrink: 0,
                          background: "linear-gradient(135deg,#C2497A,#6E54C0)", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: NUM, fontSize: 17, fontWeight: 800,
                        }}>
                          {(row.label === "Chưa có dữ liệu" ? "?" : row.label.charAt(0).toUpperCase()) || "?"}
                        </div>
                      )}
                      <span style={{ color: C.plum, fontSize: 13, fontWeight: 800 }}>{row.label}</span>
                    </div>
                  </td>
                  {!isExecutionDepartment && (
                    <td style={{ ...TD, fontFamily: NUM, fontSize: 15, fontWeight: 800, color: C.plum }}>
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
                                fontSize: 10,
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
        <div style={{ padding: 28, textAlign: "center", color: C.plumSoft, fontSize: 13, fontWeight: 700 }}>
          Không có hạng mục phù hợp với phạm vi đang chọn.
        </div>
      )}

      {activeDimension.multiNote && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: C.plumSoft, fontWeight: 600, lineHeight: 1.5 }}>
          Một hạng mục có nhiều người phụ trách được tính vào kết quả của từng người liên quan; vì vậy tổng số theo người có thể lớn hơn tổng hạng mục duy nhất.
        </div>
      )}
      {dimension === "executionDepartment" && rows.length === 1 && rows[0].key === "unknown" && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: C.plumSoft, fontWeight: 600, lineHeight: 1.5 }}>
          Cần chạy migration read model và sync snapshot mới để lấy cột Sheet “Bộ phận thực hiện thẩm định” vào dashboard.
        </div>
      )}
    </Card>
  );
}

const TH = {
  padding: "0 14px 6px", textAlign: "left", color: C.plumSoft,
  fontFamily: TEXT, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase",
  letterSpacing: ".04em", whiteSpace: "nowrap",
};

const TD = {
  padding: "11px 14px", background: "#fff", borderTop: `1px solid ${C.pinkSoft}`,
  borderBottom: `1px solid ${C.pinkSoft}`, color: C.plumSoft, fontSize: 12,
};

export default function CompletionDashboard({ acts }) {
  const [department, setDepartment] = useState("all");
  const [person, setPerson] = useState("all");
  const [dimension, setDimension] = useState("department");

  const activeActs = useMemo(() => acts.filter(ACTIVE), [acts]);
  const departmentActs = useMemo(
    () => department === "all" ? activeActs : activeActs.filter((activity) => activity.dept === department),
    [activeActs, department],
  );
  const people = useMemo(() => [...new Set(departmentActs.flatMap(activityPeople))]
    .sort((a, b) => a.localeCompare(b, "vi")), [departmentActs]);
  const selectedPerson = person === "all" || people.includes(person) ? person : "all";
  const scopedActs = useMemo(() => departmentActs.filter((activity) => (
    selectedPerson === "all" || activityPeople(activity).includes(selectedPerson)
  )), [departmentActs, selectedPerson]);
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

  const scopeLabel = [
    department === "all" ? "Tất cả bộ phận" : DEPTS.find((item) => item.id === department)?.name,
    selectedPerson === "all" ? "Tất cả người phụ trách" : selectedPerson,
  ].filter(Boolean).join(" · ");

  const resetFilters = () => {
    setDepartment("all");
    setPerson("all");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <StatusBreakdown acts={acts} />

      <Card variant="strong">
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 14, flexWrap: "wrap", marginBottom: 18,
        }}>
          <CardTitle icon={BarChart3} sub="Tính trên các hạng mục đang hoạt động, cập nhật theo dữ liệu Sheet">
            Tỷ lệ hoàn thành theo giai đoạn
          </CardTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.plumSoft }}>
              <Filter size={15} />
              <span style={{ fontSize: 11.5, fontWeight: 800 }}>Phạm vi</span>
            </div>
            <Sel
              val={department}
              set={(value) => { setDepartment(value); setPerson("all"); }}
              opts={[{ v: "all", l: "Tất cả bộ phận" }, ...DEPTS.map((item) => ({ v: item.id, l: item.name }))]}
            />
            <Sel
              val={selectedPerson}
              set={setPerson}
              opts={[{ v: "all", l: "Tất cả người phụ trách" }, ...people.map((name) => ({ v: name, l: name }))]}
            />
            {(department !== "all" || selectedPerson !== "all") && (
              <button type="button" onClick={resetFilters} style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 10px",
                borderRadius: 11, border: `1px solid ${C.pinkSoft}`, background: C.pinkMist,
                color: C.pinkText, fontFamily: TEXT, fontSize: 11.5, fontWeight: 800, cursor: "pointer",
              }}>
                <RotateCcw size={14} /> Đặt lại
              </button>
            )}
          </div>
        </div>

        <div style={{
          marginBottom: 14, padding: "9px 12px", borderRadius: 12, background: C.pinkMist,
          color: C.plumSoft, fontSize: 11.5, fontWeight: 700,
        }}>
          {scopeLabel} · <b style={{ color: C.plum }}>{scopedActs.length}</b> hạng mục
        </div>

        <div className="completion-metric-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12,
        }}>
          {METRICS.map((metric) => <MetricCard key={metric.id} metric={metric} value={summary[metric.id]} />)}
        </div>
      </Card>

      <Card variant="strong">
        <CardTitle icon={ClipboardCheck} sub="Hoàn thành được xác định theo trạng thái VMP của từng hạng mục">
          Tỷ lệ hoàn thành từng loại thẩm định
        </CardTitle>
        {typeRows.length ? (
          <div className="completion-type-grid" style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12,
          }}>
            {typeRows.map((row) => (
              <div key={row.type} style={{
                padding: "15px 16px", borderRadius: 16, background: "#fff",
                border: `1px solid ${C.pinkSoft}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.plum }}>{row.type}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: C.plumSoft, marginTop: 2 }}>
                      {row.done}/{row.total} hoàn thành VMP
                    </div>
                  </div>
                  <div style={{ fontFamily: NUM, fontSize: 25, fontWeight: 800, color: C.mintText }}>{row.rate}%</div>
                </div>
                <ProgressBar rate={row.rate} color={C.mint} height={8} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 28, textAlign: "center", color: C.plumSoft, fontSize: 13, fontWeight: 700 }}>
            Không có loại thẩm định trong phạm vi đang chọn.
          </div>
        )}
      </Card>

      <DimensionTable activities={scopedActs} dimension={dimension} setDimension={setDimension} />
    </div>
  );
}
