/** Compare explicit populations; broad legacy server totals include non-active
 * business states, whereas dashboard KPI intentionally excludes those rows. */
export interface CapSo {
  nhan: string;
  client: number | null;
  /** Authorized rows outside active KPI; diagnostic contribution only. */
  ngoaiKpi?: number;
  server: number | null;
}
export interface DongDoiChieu extends CapSo { lech:boolean; chenh:number|null }
export function soSanhDoiChieu(cacCap:readonly CapSo[],cungPhamVi=true) {
  const rows:DongDoiChieu[]=cacCap.map(c=>{
    const du=c.client!==null && c.server!==null && Number.isFinite(c.client) && Number.isFinite(c.server);
    const chenh=du && cungPhamVi ? c.server! - c.client! - (c.ngoaiKpi ?? 0) : null;
    return {...c,chenh,lech:chenh!==null && chenh!==0};
  });
  return {rows,cungPhamVi,soLech:rows.filter(r=>r.lech).length,thieuServer:rows.some(r=>r.server===null || !Number.isFinite(r.server))};
}
export function ketLuanDoiChieu(kq:ReturnType<typeof soSanhDoiChieu>):{chinh:string;tone:'ok'|'warn'|'over'} {
  if(kq.thieuServer) return {chinh:'Thiếu số liệu. Bấm Làm mới.',tone:'warn'};
  if(!kq.cungPhamVi) return {chinh:'Chưa cùng phạm vi, chưa so được. Xoá bộ lọc rồi Làm mới.',tone:'warn'};
  if(kq.soLech===0) return {chinh:'Số liệu khớp.',tone:'ok'};
  return {chinh:`${kq.soLech} chỉ số lệch.`,tone:'over'};
}
