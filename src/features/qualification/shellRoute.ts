/** The shell accepts module destinations only; never an arbitrary frame URL. */
export const QUALIFICATION_LINKS = [
  {label:'Thư viện biểu mẫu',target:'index.html'},
  {label:'Hơi tinh khiết',target:'steam.html'},
  {label:'Khí nén',target:'gas.html?system=air'},
  {label:'Khí nitơ',target:'gas.html?system=nitrogen'},
  {label:'Đợt & biểu đồ',target:'runs.html'},
];
export function qualificationTarget(input: string, base: string): string | null {
  if (!input || /[\\\\\s]/.test(input) || /(?:%2e|%2f|%5c|\.\.)/i.test(input)) return null;
  try {
    const root = new URL('tham-dinh-thuc-te/',base);
    const url = new URL(input,root);
    if(url.origin!==root.origin || url.username || url.password || url.hash) return null;
    const file = url.pathname.slice(root.pathname.length) || 'index.html';
    if(!url.pathname.startsWith(root.pathname) || !['index.html','steam.html','gas.html','runs.html'].includes(file))return null;
    for(const [key,value] of url.searchParams) {
      if(url.searchParams.getAll(key).length!==1)return null;
      if(key==='system' ? !['air','nitrogen'].includes(value) || file!=='gas.html'
        : key==='view' ? value!=='records' || !['steam.html','gas.html'].includes(file)
        : key==='form' ? !/^[A-Za-z0-9_-]{1,40}$/.test(value)
        : ['run','record'].includes(key) ? !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
        : true)return null;
    }
    return file+url.search;
  } catch { return null; }
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
