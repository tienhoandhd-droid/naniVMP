import { onCLS, onINP, onLCP } from 'web-vitals';
import { supabase } from './supabaseClient.ts';
import { supabaseUrl, supabaseAnonKey } from './supabaseConfig.ts';
import { createMetricQueue, initialScreen } from './fieldPerformanceModel.ts';

let installed = false;
/** One collector per document; bounded best-effort delivery cannot block UI. */
export function startFieldPerformance(screen: string): void {
  if (installed || !supabase || !globalThis.crypto?.randomUUID) return;
  installed = true;
  let queue = createMetricQueue();
  let pageId = crypto.randomUUID();
  const device = matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
  const safeScreen = initialScreen(`#v=${encodeURIComponent(screen)}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let busy = false;
  let sessionEpoch = 0;
  // A token is held in memory by the existing auth client already. Never persist
  // or log it; clear immediately on logout and never send an anonymous report.
  let token: string | null = null;
  let userId: string | null = null;
  let authRevision = 0;
  function updateSession(session: {access_token: string; user: {id: string}} | null) {
    if (userId && session?.user.id !== userId) {
      queue = createMetricQueue(); pageId = crypto.randomUUID(); sessionEpoch++; stopped = false;
    }
    token = session?.access_token ?? null;
    userId = session?.user.id ?? null;
  }
  supabase.auth.onAuthStateChange((_event, session) => { authRevision++; updateSession(session); });
  const revision = authRevision;
  void supabase.auth.getSession().then(({data}) => {
    if (authRevision === revision) updateSession(data.session);
  }).catch(() => {});

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (stopped || busy || !token || !queue.pending) return;
    const metrics = queue.take();
    if (!metrics.length) return;
    busy = true;
    const epoch = sessionEpoch;
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/rpc_record_web_vitals`, {
        method: 'POST', keepalive: true,
        headers: {'Content-Type':'application/json', apikey:supabaseAnonKey, Authorization:`Bearer ${token}`},
        body: JSON.stringify({p_page_id:pageId,p_screen:safeScreen,p_device:device,p_metrics:metrics}),
      });
      if (epoch !== sessionEpoch) return;
      if (!response.ok) stopped = true;
      else {
        const result = await response.json();
        if (epoch === sessionEpoch && (result?.ok !== true || result?.dropped)) stopped = true;
      }
    } catch { if (epoch === sessionEpoch) stopped = true; /* no retries after failure */ }
    finally {
      busy = false;
      // Web-vitals callbacks can arrive while a visibility flush is in flight.
      // Deliver the latest queued point rather than leaving it stranded hidden.
      if (!stopped && token && queue.pending && !timer) {
        if (document.visibilityState === 'hidden') void flush();
        else timer = setTimeout(() => { void flush(); }, 10000);
      }
    }
  }
  function record(metric: {name: string; value: number}) {
    if (stopped) return;
    queue.add(metric);
    if (!queue.pending) return;
    if (document.visibilityState === 'hidden') { void flush(); return; }
    if (!timer) timer = setTimeout(() => { void flush(); }, 10000);
  }
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      queue = createMetricQueue(); pageId = crypto.randomUUID(); sessionEpoch++; stopped = false;
    }
  });
  onLCP(record, {reportAllChanges:true});
  onINP(record, {reportAllChanges:true});
  onCLS(record, {reportAllChanges:true});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
    else if (queue.pending && !timer) timer = setTimeout(() => { void flush(); },10000);
  });
  window.addEventListener('pagehide', () => { void flush(); });
}
