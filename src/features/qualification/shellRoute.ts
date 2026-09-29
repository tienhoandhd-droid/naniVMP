/** The shell accepts module destinations only; never an arbitrary frame URL. */
export const QUALIFICATION_LINKS = [
  {label:'Đợt thẩm định',target:'runs.html'},
];
export function qualificationTarget(input: string, base: string): string | null {
  if (!input || /[\\\\\s]/.test(input) || /(?:%2e|%2f|%5c|\.\.)/i.test(input)) return null;
  try {
    const root = new URL('tham-dinh-thuc-te/',base);
    const url = new URL(input,root);
    if(url.origin!==root.origin || url.username || url.password || url.hash) return null;
    const file = url.pathname.slice(root.pathname.length) || 'index.html';
    if(!url.pathname.startsWith(root.pathname) || !['index.html','steam.html','gas.html','runs.html'].includes(file))return null;
    if(file==='index.html') return url.search ? null : 'runs.html';
    for(const [key,value] of url.searchParams) {
      if(url.searchParams.getAll(key).length!==1)return null;
      if(key==='system' ? !((file==='gas.html'&&['air','nitrogen'].includes(value)) || (file==='runs.html'&&url.searchParams.get('view')==='trend'&&['steam','air','nitrogen'].includes(value)))
        : key==='view' ? !((value==='records'&&['steam.html','gas.html'].includes(file)) || (value==='trend'&&file==='runs.html'))
        : key==='form' ? !/^[A-Za-z0-9_-]{1,40}$/.test(value) || !['steam.html','gas.html'].includes(file)
        : ['run','record'].includes(key) ? !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
        : true)return null;
    }
    if(file==='runs.html'&&url.searchParams.get('view')==='trend'&&!['steam','air','nitrogen'].includes(url.searchParams.get('system')||''))return null;
    if(file==='runs.html'&&url.searchParams.has('system')&&url.searchParams.get('view')!=='trend')return null;
    if(['steam.html','gas.html'].includes(file)&&url.searchParams.has('run')!==url.searchParams.has('record'))return null;
    return file+url.search;
  } catch { return null; }
}

/** Compare the semantic route identity, not its raw prefix. Bound record/run
 * IDs are context that may follow a form route and must not unselect it. */
export function isQualificationNavigationCurrent(target: string, current?: string | null): boolean {
  if (!current) return false;
  try {
    const base='https://vmp.invalid/tham-dinh-thuc-te/';
    const expected=new URL(target,base);
    const active=new URL(current,base);
    if(expected.pathname!==active.pathname) return false;
    for(const [key,value] of expected.searchParams) if(active.searchParams.get(key)!==value) return false;
    for(const key of active.searchParams.keys()) {
      if(!expected.searchParams.has(key)&&key!=='run'&&key!=='record') return false;
    }
    return true;
  } catch { return false; }
}
export function qualificationHref(target: string, base?: string): string {
  const query='?qualification='+encodeURIComponent(target);
  return base ? new URL(query,base).href : query;
}

// Shared with the existing VMP hash writer so replaceState preserves traversal identity.
export function shellHistoryIndex(): number {
  const index=window.history.state?.vmpShellIndex;
  return Number.isSafeInteger(index)?index:0;
}
export function writeShellHistory(url:string|URL,replace=false): void {
  const state={...window.history.state,vmpShellIndex:shellHistoryIndex()+(replace?0:1)};
  window.history[replace?'replaceState':'pushState'](state,'',url);
}

/** Apply current server system visibility to every shell route entry point. */
export function permittedQualificationTarget(input: string, base: string, systems: readonly string[]): string | null {
  if (!systems.length) return null;
  const target=qualificationTarget(input,base);
  if (!target) return null;
  const url=new URL(target,'https://vmp.invalid/');
  const system=url.pathname==='/steam.html'?'steam':url.pathname==='/gas.html'?(url.searchParams.get('system')||'air'):url.searchParams.get('view')==='trend'?url.searchParams.get('system'):null;
  return system && !systems.includes(system) ? null : target;
}
