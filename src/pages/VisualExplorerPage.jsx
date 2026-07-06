/* =====================================================================
 *  VisualExplorerPage.jsx - Timeline / Diagram / Dashboard explorer
 *  ---------------------------------------------------------------------
 *  Doc tu state Supabase da co trong app. Khong goi network, khong ghi data.
 * ===================================================================== */
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  LayoutGrid,
  Maximize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Table2,
  X,
} from "lucide-react";

import { C } from "../constants/theme.js";
import { CLS, DEPTS, STATUS, vmpToday } from "../constants/vmp.js";
import { buildVisualModel } from "../lib/visualModel.js";
import { addDays, fmtVN, parseD } from "../utils/helpers.js";
import { Card, Pill, Tag } from "../components/ui/Primitives.jsx";

const TABS = [
  { id: "timeline", label: "Timeline", icon: CalendarClock },
  { id: "diagram", label: "Sơ đồ", icon: Network },
  { id: "dashboard", label: "Bố cục", icon: LayoutGrid },
  { id: "table", label: "Bảng", icon: Table2 },
];

const STATUS_ORDER = ["over", "prog", "todo", "plan", "done"];

const SCOPE_OPTIONS = [
  { id: "all", label: "Tất cả kỳ" },
  { id: "90", label: "90 ngày tới" },
  { id: "30", label: "30 ngày tới" },
];

const PHASE_LABELS = {
  protocol: "Đề cương",
  validation: "Thẩm định thực tế",
  vmp: "Hoàn thành VMP",
};

const NODE_TYPE_LABELS = {
  source: "Nguồn dữ liệu",
  class: "Nhóm đối tượng",
  department: "Bộ phận",
  status: "Trạng thái",
};

const TONE_ICON = {
  good: CheckCircle2,
  warn: Activity,
  bad: AlertTriangle,
  neutral: Boxes,
};

function active(item) {
  return (item?.state || "active") === "active";
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function labelOfStatus(status) {
  return STATUS[status]?.label || status || "Chưa rõ";
}

function labelOfClass(cls) {
  return CLS[cls]?.label || cls || "Chưa phân loại";
}

function labelOfDept(dept) {
  return DEPTS.find((item) => item.id === dept)?.name || dept || "Chưa xác định";
}

function eventDateValue(value) {
  const date = parseD(value);
  return date ? date.getTime() : null;
}

function inScope(activity, scope) {
  if (scope === "all") return true;
  const target = parseD(activity?.target);
  if (!target) return false;
  const today = vmpToday();
  const end = addDays(today, Number(scope));
  return target >= today && target <= end;
}

function explorerStats(events) {
  const total = events.length;
  const done = events.filter((event) => event.status === "done").length;
  const attention = events.filter((event) => event.status === "over").length;
  const today = vmpToday();
  const next30 = addDays(today, 30);
  const dueSoon = events.filter((event) => {
    if (event.status === "done") return false;
    const date = parseD(event.nextMilestone?.due || event.target);
    return date && date >= today && date <= next30;
  }).length;
  return { total, done, attention, dueSoon, rate: total ? Math.round((done / total) * 100) : 0 };
}

function countRows(events, getKey, getLabel) {
  const map = new Map();
  events.forEach((event) => {
    const key = getKey(event);
    if (!key) return;
    const row = map.get(key) || { key, label: getLabel(key), count: 0 };
    row.count += 1;
    map.set(key, row);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi"));
}

function FilterSelect({ value, onChange, children, label }) {
  return (
    <label className="visual-filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function TabButton({ tab, activeTab, onClick }) {
  const Icon = tab.icon;
  const isActive = activeTab === tab.id;
  return (
    <button
      type="button"
      className={`visual-tab ${isActive ? "visual-tab--active" : ""}`}
      onClick={() => onClick(tab.id)}
    >
      <Icon size={16} />
      <span>{tab.label}</span>
    </button>
  );
}

function MetricTile({ metric }) {
  const Icon = TONE_ICON[metric.tone] || TONE_ICON.neutral;
  return (
    <div className={`visual-metric visual-metric--${metric.tone}`}>
      <div className="visual-metric__icon">
        <Icon size={18} />
      </div>
      <div className="visual-metric__body">
        <span>{metric.label}</span>
        <strong className="tnum">{metric.value}</strong>
        <small>{metric.helper}</small>
      </div>
    </div>
  );
}

function PulseMetric({ icon: Icon, label, value, helper, tone = "neutral", active: isActive, onClick }) {
  const content = (
    <>
      <Icon size={16} />
      <span>
        <small>{label}</small>
        <strong className="tnum">{value}</strong>
        <em>{helper}</em>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" className={`visual-pulse__item visual-pulse__item--${tone} ${isActive ? "visual-pulse__item--active" : ""}`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={`visual-pulse__item visual-pulse__item--${tone}`}>{content}</div>
  );
}

function EmptyPanel({ children = "Không có dữ liệu phù hợp với bộ lọc hiện tại." }) {
  return <div className="visual-empty">{children}</div>;
}

function TimelinePanel({ events, onSelect, selectedId, density }) {
  const validDates = events
    .flatMap((event) => [eventDateValue(event.start), eventDateValue(event.end), eventDateValue(event.target)])
    .filter((value) => value != null);

  if (!events.length || !validDates.length) return <EmptyPanel />;

  const min = new Date(Math.min(...validDates));
  const max = new Date(Math.max(...validDates));
  const range = Math.max(1, max.getTime() - min.getTime());
  const months = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  const maxMonth = new Date(max.getFullYear(), max.getMonth(), 1);
  while (cursor <= maxMonth && months.length < 18) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const trackWidth = Math.max(760, months.length * (density === "compact" ? 82 : 96));
  const gridStyle = {
    gridTemplateColumns: `minmax(220px, 260px) ${trackWidth}px 118px`,
    minWidth: `${220 + trackWidth + 118}px`,
  };
  const today = vmpToday();
  const todayVisible = today >= min && today <= max;

  const pct = (value) => {
    const ts = value instanceof Date ? value.getTime() : eventDateValue(value);
    if (ts == null) return 0;
    return Math.max(0, Math.min(100, ((ts - min.getTime()) / range) * 100));
  };

  return (
    <div className="visual-panel-stack">
      <div className="visual-panel-head">
        <div>
          <strong>Lịch thẩm định theo thời gian</strong>
          <span>{events.length} hạng mục · {fmtVN(min)} → {fmtVN(max)} · chọn một hàng để mở chi tiết</span>
        </div>
        <div className="visual-status-legend" aria-label="Chú giải trạng thái">
          <span className="visual-status-legend--over"><i />Cần chú ý</span>
          <span className="visual-status-legend--prog"><i />Đang chạy</span>
          <span className="visual-status-legend--done"><i />Hoàn thành</span>
        </div>
      </div>
      <div className={`visual-timeline visual-timeline--${density} vmp-scroll`}>
        <div className="visual-timeline__scale" style={gridStyle}>
          <div className="visual-timeline__scale-spacer"><span>Hạng mục</span></div>
          <div className="visual-timeline__scale-track">
            {todayVisible && <i className="visual-timeline__today visual-timeline__today--head" style={{ left: `${pct(today)}%` }}><span>Hôm nay</span></i>}
            {months.map((month) => (
              <span
                key={`${month.getFullYear()}-${month.getMonth()}`}
                style={{ left: `${Math.max(0, Math.min(100, ((month.getTime() - min.getTime()) / range) * 100))}%` }}
              >
                T{month.getMonth() + 1}/{String(month.getFullYear()).slice(2)}
              </span>
            ))}
          </div>
          <div className="visual-timeline__scale-status">Đích VMP</div>
        </div>

        {events.map((event) => {
          const left = pct(event.start || event.target);
          const right = pct(event.end || event.target);
          const width = Math.max(1.2, right - left);
          return (
            <button
              type="button"
              key={event.id}
              className={`visual-timeline-row visual-timeline-row--${event.status} ${selectedId === event.id ? "visual-timeline-row--selected" : ""}`}
              style={gridStyle}
              onClick={() => onSelect(event)}
            >
              <div className="visual-timeline-row__label">
                <strong>{event.code || "—"}</strong>
                <span>{event.title}</span>
                <small>{event.owner} · {event.departmentLabel}</small>
              </div>
              <div className="visual-timeline-row__track">
                {todayVisible && <i className="visual-timeline__today" style={{ left: `${pct(today)}%` }} />}
                <i
                  className={`visual-timeline-row__bar visual-timeline-row__bar--${event.status}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
                <em style={{ left: `${pct(event.target)}%` }} />
              </div>
              <div className="visual-timeline-row__status">
                <Pill s={event.status} small />
                <span className="tnum">{fmtVN(parseD(event.target))}</span>
                <small>{event.nextMilestone ? PHASE_LABELS[event.nextMilestone.id] : "Đã hoàn thành"}</small>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DiagramPanel({ nodes, edges, onSelectNode, selectedNodeId }) {
  const [zoom, setZoom] = useState(1);
  if (!nodes.length) return <EmptyPanel />;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const nodeWidth = (node) => (node.type === "source" ? 188 : 172);
  const nodeHeight = 58;
  const height = Math.max(320, ...nodes.map((node) => node.y + nodeHeight + 38));
  const width = 980;

  return (
    <div className="visual-panel-stack">
      <div className="visual-panel-head">
        <div>
          <strong>Bản đồ luồng dữ liệu VMP</strong>
          <span>{nodes.length} node · {edges.length} liên kết · độ dày đường biểu diễn khối lượng</span>
        </div>
        <div className="visual-zoom-controls" aria-label="Điều khiển thu phóng sơ đồ">
          <button type="button" title="Thu nhỏ" onClick={() => setZoom((value) => Math.max(.72, value - .1))}><Minus size={15} /></button>
          <span className="tnum">{Math.round(zoom * 100)}%</span>
          <button type="button" title="Phóng to" onClick={() => setZoom((value) => Math.min(1.35, value + .1))}><Plus size={15} /></button>
          <button type="button" title="Về kích thước chuẩn" onClick={() => setZoom(1)}><Maximize2 size={15} /></button>
        </div>
      </div>
      <div className="visual-diagram vmp-scroll">
        <div className="visual-diagram__stage" style={{ width: width * zoom, height: height * zoom }}>
          <div className="visual-diagram__canvas" style={{ width, height, transform: `scale(${zoom})` }}>
            {[
              [28, "Nguồn"],
              [260, "Nhóm đối tượng"],
              [520, "Bộ phận"],
              [780, "Trạng thái"],
            ].map(([left, label]) => <span key={label} className="visual-diagram__lane-head" style={{ left }}>{label}</span>)}
            <svg className="visual-diagram__edges" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
              {edges.map((edge) => {
                const source = nodeMap.get(edge.source);
                const target = nodeMap.get(edge.target);
                if (!source || !target) return null;
                const sx = source.x + nodeWidth(source);
                const sy = source.y + nodeHeight / 2;
                const tx = target.x;
                const ty = target.y + nodeHeight / 2;
                const tone = edge.status || target.meta?.key || "";
                return (
                  <path
                    key={edge.id}
                    className={`visual-diagram__edge visual-diagram__edge--${tone}`}
                    d={`M ${sx} ${sy} C ${sx + 64} ${sy}, ${tx - 64} ${ty}, ${tx} ${ty}`}
                    strokeWidth={Math.max(1.2, Math.min(6, Math.sqrt(edge.weight || 1) * 1.35))}
                  />
                );
              })}
            </svg>

            {nodes.map((node) => (
              <button
                type="button"
                key={node.id}
                className={`visual-diagram-node visual-diagram-node--${node.type} visual-diagram-node--${node.meta?.key || ""} ${selectedNodeId === node.id ? "visual-diagram-node--selected" : ""}`}
                style={{ left: node.x, top: node.y, width: nodeWidth(node), height: nodeHeight }}
                onClick={() => onSelectNode(node)}
                title={`${node.label} · ${node.count || 0} hạng mục`}
              >
                <span>{NODE_TYPE_LABELS[node.type] || node.type}</span>
                <strong>{node.label}</strong>
                <em className="tnum">{node.count || 0}</em>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardPanel({ metrics, events, onSelectStatus }) {
  if (!events.length) return <EmptyPanel />;

  const statusRows = STATUS_ORDER
    .map((status) => ({ key: status, label: labelOfStatus(status), count: events.filter((event) => event.status === status).length }))
    .filter((row) => row.count > 0);
  const classRows = countRows(events, (event) => event.group, labelOfClass);
  const deptRows = countRows(events, (event) => event.department, labelOfDept).slice(0, 8);
  const stageRows = ["protocol", "validation", "vmp"].map((key) => {
    const count = events.filter((event) => event.phaseDone?.[key]).length;
    return { key, label: PHASE_LABELS[key], count, rate: events.length ? Math.round((count / events.length) * 100) : 0 };
  });
  const maxCount = Math.max(1, ...[...statusRows, ...classRows, ...deptRows].map((row) => row.count));

  const ProgressList = ({ title, rows, kind }) => (
    <div className="visual-layout-panel">
      <div className="visual-layout-panel__head">
        <strong>{title}</strong>
        <span>{rows.length} nhóm</span>
      </div>
      <div className="visual-progress-list">
        {rows.map((row) => (
          <button
            type="button"
            key={row.key}
            className={`visual-progress-row visual-progress-row--${kind}-${row.key}`}
            onClick={() => kind === "status" && onSelectStatus(row.key)}
          >
            <span>{row.label}</span>
            <i><b style={{ width: `${Math.max(4, (row.count / maxCount) * 100)}%` }} /></i>
            <em className="tnum">{row.count}</em>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="visual-panel-stack">
      <div className="visual-panel-head">
        <div>
          <strong>Tổng quan vận hành VMP</strong>
          <span>KPI, tiến độ ba mốc và phân bố tổ chức trên cùng bộ lọc</span>
        </div>
      </div>
      <div className="visual-layout">
        <div className="visual-layout__metrics">
          {metrics.slice(0, 4).map((metric) => <MetricTile key={metric.key} metric={metric} />)}
        </div>
        <div className="visual-layout__secondary">
          {metrics.slice(4).map((metric) => (
            <span key={metric.key}><small>{metric.label}</small><strong className="tnum">{metric.value}</strong></span>
          ))}
        </div>
        <div className="visual-stage-pipeline">
          {stageRows.map((stage) => (
            <div key={stage.key} className={`visual-stage-pipeline__item visual-stage-pipeline__item--${stage.key}`}>
              <span>{stage.label}</span>
              <strong className="tnum">{stage.rate}%</strong>
              <i><b style={{ width: `${stage.rate}%` }} /></i>
              <small>{stage.count}/{events.length} hoàn thành</small>
            </div>
          ))}
        </div>
        <div className="visual-layout__grid">
          <ProgressList title="Theo trạng thái" rows={statusRows} kind="status" />
          <ProgressList title="Theo nhóm đối tượng" rows={classRows} kind="class" />
          <ProgressList title="Theo bộ phận" rows={deptRows} kind="dept" />
        </div>
      </div>
    </div>
  );
}

function TablePanel({ events, onSelect, selectedId, density }) {
  if (!events.length) return <EmptyPanel />;

  return (
    <div className="visual-panel-stack">
      <div className="visual-panel-head">
        <div>
          <strong>Bảng dữ liệu thẩm định</strong>
          <span>{events.length} dòng · header và mã hạng mục được giữ khi cuộn</span>
        </div>
      </div>
      <div className={`visual-table-wrap visual-table-wrap--${density} vmp-scroll`}>
        <table className="visual-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Hạng mục</th>
              <th>Nhóm</th>
              <th>Bộ phận</th>
              <th>Phụ trách</th>
              <th>Trạng thái</th>
              <th>Đích VMP</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className={selectedId === event.id ? "visual-table-row--selected" : ""}
                onClick={() => onSelect(event)}
              >
                <td className="tnum">{event.code || "—"}</td>
                <td>{event.title}</td>
                <td>{event.groupLabel}</td>
                <td>{event.departmentLabel}</td>
                <td>{event.owner}</td>
                <td><Pill s={event.status} small /></td>
                <td className="tnum">{fmtVN(parseD(event.target))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailPanel({ event, node, onClose }) {
  if (!event && !node) {
    return (
      <aside className="visual-detail visual-detail--empty">
        <Network size={24} />
        <strong>Chọn một dòng hoặc node</strong>
        <span>Chi tiết sẽ hiện tại đây.</span>
      </aside>
    );
  }

  if (node) {
    return (
      <aside className="visual-detail">
        <button type="button" className="visual-detail__close" onClick={onClose}><X size={15} /></button>
        <span className="visual-detail__eyebrow">{NODE_TYPE_LABELS[node.type] || node.type}</span>
        <h3>{node.label}</h3>
        <div className="visual-detail__stat">
          <span>Hạng mục liên quan</span>
          <strong className="tnum">{node.count || 0}</strong>
        </div>
        <p>Node này được tổng hợp từ dữ liệu Supabase read model hiện đang hiển thị.</p>
      </aside>
    );
  }

  const phaseRows = event.phases || [
    { id: "protocol", label: "Đề cương", done: event.phaseDone.protocol },
    { id: "validation", label: "Thẩm định thực tế", done: event.phaseDone.validation },
    { id: "vmp", label: "Hoàn thành VMP", done: event.phaseDone.vmp },
  ];

  return (
    <aside className="visual-detail">
      <button type="button" className="visual-detail__close" onClick={onClose}><X size={15} /></button>
      <span className="visual-detail__eyebrow">{event.groupLabel}</span>
      <h3>{event.title}</h3>
      <div className="visual-detail__chips">
        <Tag color={C.plum} bg={C.pinkMist}>{event.code || "—"}</Tag>
        <Pill s={event.status} small />
      </div>
      <dl>
        <div><dt>Đích VMP</dt><dd className="tnum">{fmtVN(parseD(event.target))}</dd></div>
        <div><dt>Bộ phận</dt><dd>{event.departmentLabel}</dd></div>
        <div><dt>Phụ trách</dt><dd>{event.owner}</dd></div>
        <div><dt>Mức tới hạn</dt><dd>{event.criticality}</dd></div>
      </dl>
      <div className="visual-detail__phase">
        {phaseRows.map((phase) => (
          <span key={phase.id} className={phase.done ? "visual-detail__phase-done" : ""}>
            <strong>{PHASE_LABELS[phase.id] || phase.label}</strong>
            <small className="tnum">{phase.done && phase.actual ? fmtVN(parseD(phase.actual)) : fmtVN(parseD(phase.due))}</small>
          </span>
        ))}
      </div>
    </aside>
  );
}

export default function VisualExplorerPage({ objects = [], acts = [] }) {
  const [tab, setTab] = useState("timeline");
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("all");
  const [cls, setCls] = useState("all");
  const [dept, setDept] = useState("all");
  const [density, setDensity] = useState("compact");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);

  const allModel = useMemo(() => buildVisualModel({ objects, activities: acts }), [objects, acts]);

  const filteredActivities = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return acts.filter((activity) => {
      if (!active(activity)) return false;
      if (!inScope(activity, scope)) return false;
      if (status !== "all" && activity.st !== status) return false;
      if (cls !== "all" && activity.cls !== cls) return false;
      if (dept !== "all" && activity.dept !== dept) return false;
      if (!needle) return true;
      const raw = activity._raw || {};
      return [
        activity.id,
        activity.code,
        activity.name,
        activity.owner,
        raw.qa,
        raw.ns_khac,
        raw.ten,
        raw.ma,
      ].some((value) => clean(value).toLowerCase().includes(needle));
    });
  }, [acts, cls, dept, q, scope, status]);

  const model = useMemo(
    () => buildVisualModel({ objects, activities: filteredActivities }),
    [objects, filteredActivities],
  );

  const selectedEvent = selectedId
    ? model.timelineEvents.find((event) => event.id === selectedId) || allModel.timelineEvents.find((event) => event.id === selectedId)
    : null;
  const stats = useMemo(() => explorerStats(model.timelineEvents), [model.timelineEvents]);
  const hasSelection = Boolean(selectedEvent || selectedNode);

  const classOptions = useMemo(
    () => [...new Set(allModel.timelineEvents.map((event) => event.group).filter(Boolean))],
    [allModel.timelineEvents],
  );
  const deptOptions = useMemo(
    () => [...new Set(allModel.timelineEvents.map((event) => event.department).filter(Boolean))],
    [allModel.timelineEvents],
  );

  const resetFilters = () => {
    setScope("all");
    setStatus("all");
    setCls("all");
    setDept("all");
    setQ("");
  };

  const selectEvent = (event) => {
    setSelectedId(event.id);
    setSelectedNode(null);
  };

  const selectNode = (node) => {
    setSelectedNode(node);
    setSelectedId("");
  };

  const selectTab = (value) => {
    setTab(value);
    setSelectedId("");
    setSelectedNode(null);
  };

  return (
    <div className={`visual-page-shell visual-page-shell--${density}`}>
      <Card variant="strong" cls="visual-hero-card visual-console">
        <div className="visual-hero">
          <div className="visual-context">
            <span className="visual-context__eyebrow"><Database size={13} /> Supabase read model</span>
            <strong>Không gian phân tích trực quan</strong>
            <small>Timeline, sơ đồ quan hệ và dashboard dùng chung dữ liệu VMP hiện có</small>
          </div>
          <div className="visual-hero__actions">
            <div className="visual-tabs">
              {TABS.map((item) => <TabButton key={item.id} tab={item} activeTab={tab} onClick={selectTab} />)}
            </div>
            <div className="visual-density" aria-label="Mật độ hiển thị">
              <button type="button" className={density === "compact" ? "visual-density__active" : ""} onClick={() => setDensity("compact")}><Rows3 size={14} />Gọn</button>
              <button type="button" className={density === "comfortable" ? "visual-density__active" : ""} onClick={() => setDensity("comfortable")}>Đầy đủ</button>
            </div>
          </div>
        </div>

        <div className="visual-pulse">
          <PulseMetric icon={Boxes} label="Đang hiển thị" value={stats.total} helper={`${objects.length} đối tượng`} />
          <PulseMetric icon={AlertTriangle} label="Cần chú ý" value={stats.attention} helper="quá hạn / lệch nhịp" tone="bad" active={status === "over"} onClick={() => { setStatus("over"); setTab("timeline"); }} />
          <PulseMetric icon={Clock3} label="Sắp tới 30 ngày" value={stats.dueSoon} helper="mốc chưa hoàn thành" tone="warn" active={scope === "30"} onClick={() => { setScope("30"); setStatus("all"); setTab("timeline"); }} />
          <PulseMetric icon={CheckCircle2} label="Hoàn thành" value={`${stats.rate}%`} helper={`${stats.done}/${stats.total} VMP`} tone="good" active={status === "done"} onClick={() => { setStatus("done"); setTab("timeline"); }} />
        </div>

        <div className="visual-filter-bar">
          <div className="visual-search">
            <Search size={16} />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Tìm mã, tên, phụ trách..."
            />
          </div>
          <FilterSelect label="Phạm vi" value={scope} onChange={setScope}>
            {SCOPE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </FilterSelect>
          <FilterSelect label="Trạng thái" value={status} onChange={setStatus}>
            <option value="all">Tất cả</option>
            {STATUS_ORDER.map((item) => <option key={item} value={item}>{labelOfStatus(item)}</option>)}
          </FilterSelect>
          <FilterSelect label="Nhóm" value={cls} onChange={setCls}>
            <option value="all">Tất cả</option>
            {classOptions.map((item) => <option key={item} value={item}>{labelOfClass(item)}</option>)}
          </FilterSelect>
          <FilterSelect label="Bộ phận" value={dept} onChange={setDept}>
            <option value="all">Tất cả</option>
            {deptOptions.map((item) => <option key={item} value={item}>{labelOfDept(item)}</option>)}
          </FilterSelect>
          <button type="button" className="visual-reset-btn" onClick={resetFilters} title="Xoá toàn bộ bộ lọc" aria-label="Xoá toàn bộ bộ lọc">
            <RotateCcw size={15} />
          </button>
        </div>
      </Card>

      <div className={`visual-workspace ${hasSelection ? "visual-workspace--detail" : ""}`}>
        <section className="visual-main-panel">
          {tab === "timeline" && (
            <TimelinePanel events={model.timelineEvents} selectedId={selectedId} onSelect={selectEvent} density={density} />
          )}
          {tab === "diagram" && (
            <DiagramPanel nodes={model.diagramNodes} edges={model.diagramEdges} onSelectNode={selectNode} selectedNodeId={selectedNode?.id} />
          )}
          {tab === "dashboard" && (
            <DashboardPanel
              metrics={model.dashboardMetrics}
              events={model.timelineEvents}
              onSelectStatus={(value) => {
                setStatus(value);
                selectTab("timeline");
              }}
            />
          )}
          {tab === "table" && (
            <TablePanel events={model.timelineEvents} selectedId={selectedId} onSelect={selectEvent} density={density} />
          )}
        </section>
        {hasSelection && <DetailPanel event={selectedEvent} node={selectedNode} onClose={() => { setSelectedId(""); setSelectedNode(null); }} />}
      </div>
    </div>
  );
}
