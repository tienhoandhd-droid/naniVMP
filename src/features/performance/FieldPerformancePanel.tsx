import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { Card, CardTitle } from '../../components/ui/Primitives.tsx';
import { NUM } from '../../constants/theme.ts';
import { supabase } from '../../lib/supabaseClient.ts';
import { metricRating, type MetricName } from '../../lib/fieldPerformanceModel.ts';
import './field-performance.css';

type Row = {metric:MetricName;device:string;screen:string;samples:number;p75:number};
type State = 'pending'|'empty'|'forbidden'|'unavailable'|'ready'|'error';
const labels = {LCP:'Hiển thị nội dung chính',INP:'Phản hồi thao tác',CLS:'Ổn định bố cục'};
const screenLabels: Record<string,string> = {today:'Việc hôm nay',overview:'Tổng quan',timeline:'Long Môn',alerts:'Cảnh báo',risk:'Rủi ro',progress:'Cập nhật tiến độ',inventory:'Danh mục',source:'Dữ liệu nguồn',workload:'Khối lượng công việc',reports:'Báo cáo',rules:'Quy tắc',health:'Chất lượng dữ liệu',audit:'Nhật ký',accounts:'Tài khoản',admin:'Quản trị',phanquyen:'Phân quyền',other:'Trang mở đầu khác'};
const ratingLabels = {good:'Tốt','needs-improvement':'Cần cải thiện',poor:'Chậm / chưa ổn định',pending:'Chờ số đo'};
export default function FieldPerformancePanel() {
  const [state,setState] = useState<State>('pending');
  const [rows,setRows] = useState<Row[]>([]);
  const inflight = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true; setState('pending');
    try {
      if (!supabase) { setState('unavailable'); return; }
      const rpc = supabase.rpc.bind(supabase) as unknown as (name:string) => Promise<{data:unknown;error:{code?:string}|null}>;
      const {data,error} = await rpc('rpc_web_vitals_summary');
      if (!mounted.current) return;
      if (error) { setState(['PGRST202','42883'].includes(error.code || '')?'unavailable':error.code==='42501'?'forbidden':'error'); return; }
      const result = data as {ok?:boolean;error_code?:string;rows?:Row[]}|null;
      if (!result?.ok) { setState(['FORBIDDEN','SESSION_INACTIVE'].includes(result?.error_code || '')?'forbidden':'error'); return; }
      const valid = (result.rows || []).filter(row => row.metric in labels && Number.isFinite(row.p75) && row.p75 >= 0 && Number.isInteger(row.samples) && row.samples > 0);
      setRows(valid); setState(valid.length?'ready':'empty');
    } catch { if (mounted.current) setState('error'); }
    finally { inflight.current = false; }
  },[]);
  useEffect(() => { mounted.current=true; void load(); return () => {mounted.current=false;}; },[load]);
  return <section data-field-performance-panel data-field-performance-state={state}>
    <Card>
      <CardTitle icon={Activity} sub="Trải nghiệm trên thiết bị người dùng · tổng hợp 7 ngày gần nhất"
        right={<button type="button" data-field-performance-refresh onClick={() => void load()} disabled={state==='pending'} className="field-perf-refresh"><RefreshCw size={15}/> Làm mới số đo</button>}>
        Hiệu năng thực tế
      </CardTitle>
      <p className="field-perf-explanation">Mỗi lần mở trang đóng góp tối đa một giá trị cho mỗi chỉ số. P75 nghĩa là 75% số đo không vượt quá giá trị này. Nhóm theo <b>trang mở đầu</b>; phản hồi thao tác có thể gồm các tab mở tiếp trong cùng phiên trang.</p>
      <div role="status" aria-live="polite">
        {state==='pending' && 'Đang tải số đo…'}
        {state==='empty' && 'Chưa có số đo trong 7 ngày qua. Hệ thống sẽ ghi nhận khi người dùng mở trang và thao tác; chưa có số đo không có nghĩa là tốc độ bằng 0.'}
        {state==='forbidden' && 'Bạn không có quyền xem số đo hoặc phiên đăng nhập đã hết hiệu lực.'}
        {state==='unavailable' && 'Kênh đo hiệu năng chưa sẵn sàng. Các chức năng khác vẫn sử dụng bình thường.'}
        {state==='error' && 'Không tải được số đo. Hãy thử làm mới số đo.'}
      </div>
      {state==='ready' && <div className="field-perf-grid">{rows.map(row => {
        const rating=metricRating(row.metric,row.p75);
        return <article key={`${row.metric}:${row.screen}:${row.device}`} className="field-perf-metric" data-rating={rating}>
          <div className="field-perf-eyebrow">{row.metric} · {row.device==='mobile'?'Điện thoại / màn hình nhỏ':'Máy tính'}</div>
          <h3>{labels[row.metric]}</h3>
          <div className="field-perf-value" style={{fontFamily:NUM}}>{row.metric==='CLS'?row.p75.toFixed(3):Math.round(row.p75).toLocaleString('vi-VN')}<small>{row.metric==='CLS'?' điểm':' ms'}</small></div>
          <span className="field-perf-rating">{ratingLabels[rating]}</span>
          <p>{screenLabels[row.screen] || screenLabels.other} · {row.samples} phiên trang</p>
          {row.samples<20 && <p className="field-perf-small-sample">Ít mẫu — chỉ dùng để tham khảo.</p>}
        </article>;
      })}</div>}
      <details className="field-perf-help"><summary>Cách đọc số đo và quyền riêng tư</summary><p>LCP tốt: ≤ 2.500 ms. INP tốt: ≤ 200 ms. CLS tốt: ≤ 0,1. INP cần có thao tác; trình duyệt chưa hỗ trợ hoặc chưa có số đo sẽ không hiện giá trị giả.</p><p>Gói số đo chỉ chứa chỉ số, mã phiên trang ngẫu nhiên, loại màn hình và tên trang thuộc danh sách cố định. Yêu cầu được xác thực bằng phiên đăng nhập; máy chủ lưu mã tài khoản nội bộ để giới hạn số lần gửi. Không gửi tên hồ sơ, nội dung nhập, email hay chuỗi tìm kiếm. Dữ liệu giữ tối đa khoảng 30 ngày, chỉ tổng hợp 7 ngày gần nhất. Quản trị và quản lý QA được phép xem số liệu tổng hợp, kể cả nhóm chỉ có một phiên trang. Đây là số đo do trình duyệt báo, không phải nhật ký nghiệp vụ.</p></details>
    </Card>
  </section>;
}
