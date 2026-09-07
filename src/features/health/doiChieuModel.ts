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
  if(kq.thieuServer) return {chinh:'Chưa đối chiếu đầy đủ — chưa nhận đủ số liệu máy chủ. Hãy thử làm mới hai nguồn.',tone:'warn'};
  if(!kq.cungPhamVi) return {chinh:'Hai nguồn chưa cùng phạm vi. Hãy xóa bộ lọc và làm mới hai nguồn; chưa thể kết luận đây là lỗi dữ liệu.',tone:'warn'};
  if(kq.soLech===0) return {chinh:'Các chỉ số khớp sau khi tính thêm các hạng mục ngoài KPI để đối chiếu cùng phạm vi.',tone:'ok'};
  return {chinh:`${kq.soLech} chỉ số còn khác sau khi đưa về cùng phạm vi. Cần kiểm tra quy tắc trạng thái và thời điểm cập nhật; chưa thể kết luận bên nào sai.`,tone:'over'};
}
