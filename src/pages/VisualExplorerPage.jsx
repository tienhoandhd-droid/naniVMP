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
  Filter,
  LayoutGrid,
  Network,
  Search,
  Table2,
  Users,
  X,
} from "lucide-react";

import { C, GRAD, NUM, TEXT } from "../constants/theme.js";
import { CLS, DEPTS, STATUS } from "../constants/vmp.js";
import { buildVisualModel } from "../lib/visualModel.js";
import { fmtVN, parseD } from "../utils/helpers.js";
import { Card, CardTitle, Pill, Tag } from "../components/ui/Primitives.jsx";

const TABS = [
  { id: "timeline", label: "Timeline", icon: CalendarClock },
  { id: "diagram", label: "Sơ đồ", icon: Network },
  { id: "dashboard", label: "Bố cục", icon: LayoutGrid },
  { id: "table", label: "Bảng", icon: Table2 },
];

const STATUS_ORDER = ["over", "prog", "todo", "plan", "done"];

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

function statusTone(status) {
  if (status === "done") return "good";
  if (status === "over") return "bad";
  if (status === "prog") return "warn";
  return "neutral";
}

function eventDateValue(value) {
  const date = parseD(value);
  return date ? date.getTime() : null;
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

function EmptyPanel({ children = "Không có dữ liệu phù hợp với bộ lọc hiện tại." }) {
  return <div className="visual-empty">{children}</div>;
}

function TimelinePanel({ events, onSelect, selectedId }) {
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

  const pct = (value) => {
    const ts = eventDateValue(value);
    if (ts == null) return 0;
    return Math.max(0, Math.min(100, ((ts - min.getTime()) / range) * 100));
  };

  return (
    <div className="visual-timeline vmp-scroll">
      <div className="visual-timeline__scale">
        <div className="visual-timeline__scale-spacer" />
        <div className="visual-timeline__scale-track">
          {months.map((month) => (
            <span
              key={`${month.getFullYear()}-${month.getMonth()}`}
              style={{ left: `${Math.max(0, Math.min(100, ((month.getTime() - min.getTime()) / range) * 100))}%` }}
            >
              T{month.getMonth() + 1}/{String(month.getFullYear()).slice(2)}
            </span>
          ))}
        </div>
      </div>

      {events.map((event) => {
        const left = pct(event.start || event.target);
        const right = pct(event.end || event.target);
        const width = Math.max(1.4, right - left);
        return (
          <button
            type="button"
            key={event.id}
            className={`visual-timeline-row visual-timeline-row--${event.status} ${selectedId === event.id ? "visual-timeline-row--selected" : ""}`}
            onClick={() => onSelect(event)}
          >
            <div className="visual-timeline-row__label">
              <strong>{event.code || "—"}</strong>
              <span>{event.title}</span>
              <small>{event.owner} · {event.departmentLabel}</small>
            </div>
            <div className="visual-timeline-row__track">
              <i
                className={`visual-timeline-row__bar visual-timeline-row__bar--${event.status}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
              <em style={{ left: `${pct(event.target)}%` }} />
            </div>
            <div className="visual-timeline-row__status">
              <Pill s={event.status} small />
              <span className="tnum">{fmtVN(parseD(event.target))}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DiagramPanel({ nodes, edges, onSelectNode }) {
  if (!nodes.length) return <EmptyPanel />;

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const nodeWidth = (node) => (node.type === "source" ? 188 : 172);
  const nodeHeight = 58;
  const height = Math.max(320, ...nodes.map((node) => node.y + nodeHeight + 38));
  const width = 980;

  return (
    <div className="visual-diagram vmp-scroll">
      <div className="visual-diagram__canvas" style={{ width, height }}>
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
                d={`M ${sx} ${sy} C ${sx + 72} ${sy}, ${tx - 72} ${ty}, ${tx} ${ty}`}
                strokeWidth={Math.max(1.4, Math.min(7, Math.sqrt(edge.weight || 1) * 1.6))}
              />
            );
          })}
        </svg>

        {nodes.map((node) => (
          <button
            type="button"
            key={node.id}
            className={`visual-diagram-node visual-diagram-node--${node.type} visual-diagram-node--${node.meta?.key || ""}`}
            style={{ left: node.x, top: node.y, width: nodeWidth(node), height: nodeHeight }}
            onClick={() => onSelectNode(node)}
            title={`${node.label} · ${node.count || 0} hạng mục`}
          >
            <span>{node.type}</span>
            <strong>{node.label}</strong>
            <em className="tnum">{node.count || 0}</em>
          </button>
        ))}
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
    <div className="visual-layout">
      <div className="visual-layout__metrics">
        {metrics.map((metric) => <MetricTile key={metric.key} metric={metric} />)}
      </div>
      <div className="visual-layout__grid">
        <ProgressList title="Theo trạng thái" rows={statusRows} kind="status" />
        <ProgressList title="Theo nhóm đối tượng" rows={classRows} kind="class" />
        <ProgressList title="Theo bộ phận" rows={deptRows} kind="dept" />
      </div>
    </div>
  );
}

function TablePanel({ events, onSelect, selectedId }) {
  if (!events.length) return <EmptyPanel />;

  return (
    <div className="visual-table-wrap vmp-scroll">
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
        <span className="visual-detail__eyebrow">{node.type}</span>
        <h3>{node.label}</h3>
        <div className="visual-detail__stat">
          <span>Hạng mục liên quan</span>
          <strong className="tnum">{node.count || 0}</strong>
        </div>
        <p>Node này được tổng hợp từ dữ liệu Supabase read model hiện đang hiển thị.</p>
      </aside>
    );
  }

  const phaseRows = [
    ["Đề cương", event.phaseDone.protocol],
    ["Thực tế", event.phaseDone.validation],
    ["Hồ sơ", event.phaseDone.report],
    ["VMP", event.phaseDone.vmp],
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
        {phaseRows.map(([label, done]) => (
          <span key={label} className={done ? "visual-detail__phase-done" : ""}>
            {label}
          </span>
        ))}
      </div>
    </aside>
  );
}

export default function VisualExplorerPage({ objects = [], acts = [] }) {
  const [tab, setTab] = useState("timeline");
  const [status, setStatus] = useState("all");
  const [cls, setCls] = useState("all");
  const [dept, setDept] = useState("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);

  const allModel = useMemo(() => buildVisualModel({ objects, activities: acts }), [objects, acts]);

  const filteredActivities = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return acts.filter((activity) => {
      if (!active(activity)) return false;
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
  }, [acts, cls, dept, q, status]);

  const model = useMemo(
    () => buildVisualModel({ objects, activities: filteredActivities }),
    [objects, filteredActivities],
  );

  const selectedEvent = selectedId
    ? model.timelineEvents.find((event) => event.id === selectedId) || allModel.timelineEvents.find((event) => event.id === selectedId)
    : null;

  const classOptions = useMemo(
    () => [...new Set(allModel.timelineEvents.map((event) => event.group).filter(Boolean))],
    [allModel.timelineEvents],
  );
  const deptOptions = useMemo(
    () => [...new Set(allModel.timelineEvents.map((event) => event.department).filter(Boolean))],
    [allModel.timelineEvents],
  );

  const resetFilters = () => {
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

  return (
    <div className="visual-page-shell">
      <Card variant="strong" cls="visual-hero-card">
        <div className="visual-hero">
          <div>
            <CardTitle icon={Network} sub="Timeline, sơ đồ và bố cục dashboard từ cùng một contract dữ liệu">
              Visual Explorer
            </CardTitle>
            <div className="visual-hero__meta">
              <span>{model.timelineEvents.length} hạng mục đang hiển thị</span>
              <span>{objects.length} đối tượng</span>
              <span>Nguồn: Supabase read model</span>
            </div>
          </div>
          <div className="visual-tabs">
            {TABS.map((item) => <TabButton key={item.id} tab={item} activeTab={tab} onClick={setTab} />)}
          </div>
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
          <button type="button" className="visual-reset-btn" onClick={resetFilters}>
            <Filter size={14} />
            Xoá lọc
          </button>
        </div>
      </Card>

      <div className="visual-workspace">
        <section className="visual-main-panel">
          {tab === "timeline" && (
            <TimelinePanel events={model.timelineEvents} selectedId={selectedId} onSelect={selectEvent} />
          )}
          {tab === "diagram" && (
            <DiagramPanel nodes={model.diagramNodes} edges={model.diagramEdges} onSelectNode={selectNode} />
          )}
          {tab === "dashboard" && (
            <DashboardPanel
              metrics={model.dashboardMetrics}
              events={model.timelineEvents}
              onSelectStatus={(value) => {
                setStatus(value);
                setTab("timeline");
              }}
            />
          )}
          {tab === "table" && (
            <TablePanel events={model.timelineEvents} selectedId={selectedId} onSelect={selectEvent} />
          )}
        </section>
        <DetailPanel event={selectedEvent} node={selectedNode} onClose={() => { setSelectedId(""); setSelectedNode(null); }} />
      </div>
    </div>
  );
}
