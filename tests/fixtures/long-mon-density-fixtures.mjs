const DAY_MS = 86_400_000;
const WINDOW_START = Date.UTC(2026, 7, 2);

export function makeLongMonDensityActivities({ count, deadline, prefix }) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    code: `${prefix.toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
    name: `Hạng mục ${prefix} ${index + 1}`,
    target: deadline,
    canonicalDeadline: deadline,
    state: "active",
    st: "todo",
    _raw: {
      dl_vmp: deadline,
      deadline_vmp: deadline,
      state: "active",
      status: "todo",
    },
  }));
}

function isoAtOffset(dayOffset) {
  return new Date(WINDOW_START + dayOffset * DAY_MS).toISOString().slice(0, 10);
}

function sameDeadlineScenario(count, formation) {
  return {
    id: `same-${count}`,
    label: `${count} cá cùng deadline`,
    expectedCount: count,
    expectedFormation: formation,
    activities: makeLongMonDensityActivities({
      count,
      deadline: "2026-09-05",
      prefix: `same-${count}`,
    }),
  };
}

const adjacentActivities = [
  ...makeLongMonDensityActivities({ count: 18, deadline: "2026-09-05", prefix: "adjacent-a" }),
  ...makeLongMonDensityActivities({ count: 18, deadline: "2026-09-06", prefix: "adjacent-b" }),
];

const peakActivities = [
  ...makeLongMonDensityActivities({ count: 20, deadline: "2026-08-10", prefix: "peak-a" }),
  ...makeLongMonDensityActivities({ count: 20, deadline: "2026-08-31", prefix: "peak-b" }),
  ...makeLongMonDensityActivities({ count: 20, deadline: "2026-09-20", prefix: "peak-c" }),
  ...Array.from({ length: 60 }, (_, index) => makeLongMonDensityActivities({
    count: 1,
    deadline: isoAtOffset(index % 59),
    prefix: `peak-spread-${index + 1}`,
  })[0]),
];

const incidentActivities = [
  ...makeLongMonDensityActivities({ count: 42, deadline: "2026-08-10", prefix: "incident-a" }),
  ...makeLongMonDensityActivities({ count: 42, deadline: "2026-08-31", prefix: "incident-b" }),
  ...makeLongMonDensityActivities({ count: 42, deadline: "2026-09-20", prefix: "incident-c" }),
];

export const LONG_MON_DENSITY_SCENARIOS = [
  sameDeadlineScenario(1, "solo"),
  sameDeadlineScenario(5, "arc"),
  sameDeadlineScenario(12, "double-stream"),
  sameDeadlineScenario(24, "teardrop"),
  sameDeadlineScenario(40, "branches"),
  {
    id: "adjacent-18-18",
    label: "18 + 18 cá ở hai deadline kế tiếp",
    expectedCount: 36,
    activities: adjacentActivities,
  },
  {
    id: "peak-120",
    label: "120 cá mùa cao điểm",
    expectedCount: 120,
    activities: peakActivities,
  },
  {
    id: "incident-126",
    label: "126 cá tập trung ba deadline",
    expectedCount: 126,
    activities: incidentActivities,
  },
];
