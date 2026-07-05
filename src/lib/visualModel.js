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
  return STATUS[status]?.label || status || "Chua ro";
}

function classLabel(cls) {
  return CLS[cls]?.label || cls || "Chua phan loai";
}

function deptLabel(dept) {
  return DEPTS.find((item) => item.id === dept)?.name || dept || "Chua xac dinh";
}

function criticalityLabel(value) {
  const v = clean(value);
  if (v === "Thấp") return "Thap";
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
      const target = parseD(activity.target) || m.target || null;
      const start = m.protocol || target;
      const end = m.target || target;
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
        phaseDone: {
          protocol: phaseDone(activity, "tt_de_cuong"),
          validation: phaseDone(activity, "tt_tham_dinh"),
          report: phaseDone(activity, "tt_bao_cao"),
          vmp: phaseDone(activity, "tt_vmp"),
        },
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
      label: "Hang muc active",
      value: total,
      tone: "neutral",
      helper: "Tong hang muc dang duoc tinh trong dashboard",
    },
    {
      key: "completion_rate",
      label: "Ty le hoan thanh",
      value: `${percent(done, total)}%`,
      tone: done === total && total ? "good" : "neutral",
      helper: `${done}/${total} hang muc da hoan thanh VMP`,
    },
    {
      key: "overdue_items",
      label: "Can chu y",
      value: over,
      tone: over ? "bad" : "good",
      helper: "Hang muc qua han hoac lech nhip theo trang thai hien tai",
    },
    {
      key: "in_progress",
      label: "Dang thuc hien",
      value: prog,
      tone: prog ? "warn" : "neutral",
      helper: "Hang muc co it nhat mot giai doan dang chay",
    },
    {
      key: "planned_items",
      label: "Ke hoach/chua lam",
      value: plan,
      tone: "neutral",
      helper: "Hang muc chua bat dau hoac nam trong ke hoach",
    },
    {
      key: "objects",
      label: "Doi tuong",
      value: objectCodes.size || objects.length,
      tone: "neutral",
      helper: "Ma doi tuong duy nhat tu Supabase read model",
    },
    {
      key: "owners",
      label: "Nguoi lien quan",
      value: owners,
      tone: "neutral",
      helper: "Nguoi/nhom phu trach doc tu du lieu hien co",
    },
  ];
}

function aggregateNodes(prefix, counts, type, x, labelOf) {
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "vi"));
  const gap = rows.length > 4 ? 78 : 94;
  const top = 92 - ((rows.length - 1) * gap) / 2;
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
