/** Strict telemetry projection. Never retain web-vitals entries/DOM/URLs. */
export type MetricName = 'LCP' | 'INP' | 'CLS';
export type MetricPoint = { name: MetricName; value: number };
const SCREENS = new Set(['today','overview','timeline','alerts','risk','progress','inventory','source','workload','reports','rules','health','audit','accounts','admin','phanquyen']);
export function initialScreen(hash: string): string {
  const screen = new URLSearchParams(hash.replace(/^#/, '')).get('v') || '';
  return SCREENS.has(screen) ? screen : 'other';
}
export function cleanMetric(metric: { name?: unknown; value?: unknown }): MetricPoint | null {
  const { name, value } = metric;
  if (name !== 'LCP' && name !== 'INP' && name !== 'CLS') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (name === 'CLS' ? 10 : 600000)) return null;
  return { name, value: Number(value.toFixed(name === 'CLS' ? 4 : 2)) };
}
export function createMetricQueue(maxBatches = 10) {
  const pending = new Map<MetricName, MetricPoint>();
  const sent = new Map<MetricName, number>();
  let batches = 0;
  return {
    add(metric: {name?: unknown; value?: unknown}) {
      const point = cleanMetric(metric);
      if (!point || batches >= maxBatches) return;
      if (sent.get(point.name) === point.value) pending.delete(point.name);
      else pending.set(point.name, point);
    },
    take(): MetricPoint[] {
      if (batches >= maxBatches || !pending.size) return [];
      const points = [...pending.values()]; pending.clear(); batches++;
      for (const point of points) sent.set(point.name, point.value);
      return points;
    },
    get pending() { return pending.size > 0 && batches < maxBatches; },
  };
}
export function metricRating(name: MetricName, value: number | null) {
  if (value == null || !Number.isFinite(value)) return 'pending';
  const thresholds = name === 'LCP' ? [2500,4000] : name === 'INP' ? [200,500] : [.1,.25];
  return value <= thresholds[0] ? 'good' : value <= thresholds[1] ? 'needs-improvement' : 'poor';
}
