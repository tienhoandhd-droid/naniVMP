/* =====================================================================
 *  visualModel.js - Contract trung gian cho Timeline / Diagram / Dashboard
 *  ---------------------------------------------------------------------
 *  Nguon vao: objects + acts da duoc nap tu Supabase va enrich trong app.
 *  Module nay KHONG goi network, KHONG ghi du lieu, KHONG phu thuoc React.
 * ===================================================================== */
import { CLS, DEPTS, STATUS } from "../constants/vmp.js";
import { milestones, parseD, wlIsDone } from "../utils/helpers.js";

const ACTIVE = (item) => (item?.state || "active") === "active";

const clean = (value) => String(value == null ? "" : value).trim();

function dateISO(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function ownerOf(activity) {
  const raw = activity?._raw || {};
  return [
    activity?.owner,
    raw.qa,
    raw.ns_khac,
    raw.secondary_owner,
    raw.owner_name,
    activity?.secondary_owner,
    activity?.owner_name,
  ].map(clean).find((value) => value && value !== "—") || "—";
}

function countBy(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

function percent(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

function statusLabel(status) {
  return STATUS[status]?.label || status || "Chưa rõ";
}

function classLabel(cls) {
  return CLS[cls]?.label || cls || "Chưa phân loại";
}

function deptLabel(dept) {
  return DEPTS.find((item) => item.id === dept)?.name || dept || "Chưa xác định";
}

function criticalityLabel(value) {
  const v = clean(value);
  return v || "TB";
}

function targetTime(activity) {
  return (parseD(activity?.target) || new Date(2999, 0, 1)).getTime();
}

function phaseDone(activity, field) {
  const raw = activity?._raw || {};
  if (field === "tt_vmp") return activity?.st === "done" || wlIsDone(raw.tt_vmp);
  return wlIsDone(raw[field]);
}

export function buildTimelineEvents(activities = []) {
  return activities
    .filter(ACTIVE)
    .map((activity) => {
      const m = activity.m || milestones(activity);
      const raw = activity._raw || {};
      const target = parseD(activity.target) || m.target || null;
      const start = m.protocol || target;
      const end = m.target || target;
      const phaseDoneState = {
        protocol: phaseDone(activity, "tt_de_cuong"),
        validation: phaseDone(activity, "tt_tham_dinh"),
        report: phaseDone(activity, "tt_bao_cao"),
        vmp: phaseDone(activity, "tt_vmp"),
      };
      const phases = [
        { id: "protocol", label: "De cuong", due: dateISO(m.protocol), actual: dateISO(parseD(raw.ngay_de_cuong)), done: phaseDoneState.protocol },
        { id: "validation", label: "Tham dinh thuc te", due: dateISO(m.validation), actual: dateISO(parseD(raw.ngay_tham_dinh)), done: phaseDoneState.validation },
        { id: "vmp", label: "Hoan thanh VMP", due: dateISO(m.target), actual: dateISO(parseD(raw.ngay_vmp)), done: phaseDoneState.vmp },
      ];
      return {
        id: String(activity.id || `${activity.code}-${activity.vtype}`),
        code: activity.code || "",
        title: activity.name || activity.code || activity.id || "Hang muc VMP",
        start: dateISO(start),
        end: dateISO(end),
        target: dateISO(target),
        status: activity.st || "todo",
        statusLabel: statusLabel(activity.st),
        group: activity.cls || "tb",
        groupLabel: classLabel(activity.cls),
        department: activity.dept || "qa",
        departmentLabel: deptLabel(activity.dept),
        owner: ownerOf(activity),
        criticality: criticalityLabel(activity.crit),
        source: "supabase",
        phaseDone: phaseDoneState,
        phases,
        nextMilestone: phases.find((phase) => !phase.done) || null,
        raw: activity,
      };
    })
    .sort((a, b) => targetTime(a.raw) - targetTime(b.raw)
      || String(a.code).localeCompare(String(b.code), "vi"));
}

export function buildDashboardMetrics(activities = [], objects = []) {
  const active = activities.filter(ACTIVE);
  const total = active.length;
  const done = active.filter((item) => item.st === "done").length;
  const over = active.filter((item) => item.st === "over").length;
  const prog = active.filter((item) => item.st === "prog").length;
  const plan = active.filter((item) => item.st === "plan" || item.st === "todo").length;
  const owners = countBy(active, ownerOf).size;
  const objectCodes = new Set(objects.map((item) => clean(item.code)).filter(Boolean));

  return [
    {
      key: "active_items",
      label: "Hạng mục đang theo dõi",
      value: total,
      tone: "neutral",
      helper: "Tổng hạng mục đang được tính trong dashboard",
    },
    {
      key: "completion_rate",
      label: "Tỷ lệ hoàn thành",
      value: `${percent(done, total)}%`,
      tone: done === total && total ? "good" : "neutral",
      helper: `${done}/${total} hạng mục đã hoàn thành VMP`,
    },
    {
      key: "overdue_items",
      label: "Cần chú ý",
      value: over,
      tone: over ? "bad" : "good",
      helper: "Hạng mục quá hạn hoặc lệch nhịp theo trạng thái hiện tại",
    },
    {
      key: "in_progress",
      label: "Đang thực hiện",
      value: prog,
      tone: prog ? "warn" : "neutral",
      helper: "Hạng mục có ít nhất một giai đoạn đang chạy",
    },
    {
      key: "planned_items",
      label: "Kế hoạch / chưa làm",
      value: plan,
      tone: "neutral",
      helper: "Hạng mục chưa bắt đầu hoặc nằm trong kế hoạch",
    },
    {
      key: "objects",
      label: "Đối tượng",
      value: objectCodes.size || objects.length,
      tone: "neutral",
      helper: "Mã đối tượng duy nhất từ Supabase read model",
    },
    {
      key: "owners",
      label: "Người liên quan",
      value: owners,
      tone: "neutral",
      helper: "Người/nhóm phụ trách đọc từ dữ liệu hiện có",
    },
  ];
}

function aggregateNodes(prefix, counts, type, x, labelOf) {
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "vi"));
  const gap = rows.length > 8 ? 58 : rows.length > 4 ? 70 : 82;
  const top = 58;
  return rows.map(([key, count], index) => ({
    id: `${prefix}:${key || "unknown"}`,
    label: labelOf(key),
    type,
    count,
    x,
    y: top + index * gap,
    meta: { key },
  }));
}

export function buildDiagramModel(activities = []) {
  const active = activities.filter(ACTIVE);
  const classCounts = countBy(active, (item) => item.cls || "tb");
  const deptCounts = countBy(active, (item) => item.dept || "qa");
  const statusCounts = countBy(active, (item) => item.st || "todo");

  const sourceNode = {
    id: "source:supabase",
    label: "Supabase read model",
    type: "source",
    count: active.length,
    x: 28,
    y: 92,
    meta: { source: "rpc_get_vmp_dashboard" },
  };

  const classNodes = aggregateNodes("class", classCounts, "class", 260, classLabel);
  const deptNodes = aggregateNodes("department", deptCounts, "department", 520, deptLabel);
  const statusNodes = aggregateNodes("status", statusCounts, "status", 780, statusLabel);

  const edges = [];

  classNodes.forEach((node) => {
    edges.push({
      id: `source->${node.id}`,
      source: sourceNode.id,
      target: node.id,
      relation: "phan loai",
      weight: node.count,
    });
  });

  const classDept = countBy(active, (item) => `${item.cls || "tb"}|${item.dept || "qa"}`);
  [...classDept.entries()].forEach(([key, weight]) => {
    const [cls, dept] = key.split("|");
    edges.push({
      id: `class:${cls}->department:${dept}`,
      source: `class:${cls}`,
      target: `department:${dept}`,
      relation: "quan ly",
      weight,
    });
  });

  const deptStatus = countBy(active, (item) => `${item.dept || "qa"}|${item.st || "todo"}`);
  [...deptStatus.entries()].forEach(([key, weight]) => {
    const [dept, status] = key.split("|");
    edges.push({
      id: `department:${dept}->status:${status}`,
      source: `department:${dept}`,
      target: `status:${status}`,
      relation: "trang thai",
      weight,
      status,
    });
  });

  return {
    nodes: [sourceNode, ...classNodes, ...deptNodes, ...statusNodes],
    edges,
  };
}

export function buildVisualModel({ objects = [], activities = [] } = {}) {
  const timelineEvents = buildTimelineEvents(activities);
  const diagram = buildDiagramModel(activities);
  const metrics = buildDashboardMetrics(activities, objects);

  return {
    timelineEvents,
    diagramNodes: diagram.nodes,
    diagramEdges: diagram.edges,
    dashboardMetrics: metrics,
    generatedAt: new Date().toISOString(),
  };
}
