-- =====================================================================
-- 20261112100000_tham_dinh_xu_huong_dang_nhap.sql
-- ---------------------------------------------------------------------
-- Yêu cầu chủ dự án 12/11/2026: sơ đồ xu hướng khí/hơi phải xem được kết quả
-- các điểm lấy mẫu NGAY KHI ĐANG NHẬP, không đợi đóng đợt.
--
-- Trước: public.cpc1_history_list() chỉ trả hồ sơ của đợt đã đóng
--   (r.status <> 'open', đúng bản chốt i.closed_revision).
-- Sau:  trả thêm hồ sơ của đợt ĐANG MỞ, lấy BẢN LƯU MỚI NHẤT (rec.version),
--   kèm cờ in_progress = true để giao diện ghi rõ "Đang nhập".
--
-- · Thân hàm NGUYÊN VĂN bản production (20260929120000_qualification_pq_access.sql),
--   chỉ đổi nhánh "fresh": điều kiện nối bản và thêm khoá in_progress.
-- · Đợt đã đóng: vẫn đúng bản chốt như cũ (in_progress = false).
-- · Hồ sơ đợt mở chưa lưu gì (chỉ có bản 1) vẫn KHÔNG hiện (v.version > 1).
-- · Quyền xem KHÔNG đổi: vẫn lọc bằng cpc1_private.record_pq_right(record, false).
-- · KHÔNG đổi công thức, tiêu chí, biểu mẫu in, hồ sơ đã đóng; hàm chỉ đọc.
-- · Biểu đồ "Qua các đợt đã đóng" ở giao diện vẫn tự lọc đợt đã đóng nên
--   số chưa chốt không vào cảnh báo xu hướng.
-- Giữ nguyên SECURITY DEFINER / search_path / quyền (CREATE OR REPLACE giữ ACL).
-- =====================================================================
begin;

create or replace function public.cpc1_history_list()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare u uuid:=cpc1_private.viewer();historical jsonb;fresh jsonb;begin
 historical:=coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'run_id',h.run_id,'record_id',h.record_id,'version',h.version,'system',h.system,'period',h.period,'comparison',h.comparison,'trend',h.trend,'issues',coalesce(h.provenance->'issues','[]'),'imported_at',h.imported_at,'sources',h.source_manifest) order by h.period,h.system)
 from cpc1_private.history_imports h join cpc1_private.runs r on r.id=h.run_id where cpc1_private.record_pq_right(h.record_id,false)),'[]');
 -- Đợt đã đóng: bản chốt. Đợt đang mở: bản lưu mới nhất, đánh dấu in_progress.
 select coalesce(jsonb_agg(jsonb_build_object('id',i.record_id,'run_id',r.id,'record_id',i.record_id,'version',v.version,'system',i.system,'period',date_trunc('month',r.started_on)::date,'comparison','[]'::jsonb,'trend',cpc1_private.trend_rows(i.system,v.payload,v.evaluation,i.scope),'issues','[]'::jsonb,'sources','[]'::jsonb,'in_progress',r.status='open') order by r.started_on),'[]') into fresh
 from cpc1_private.run_items i join cpc1_private.runs r on r.id=i.run_id join public.cpc1_records rec on rec.id=i.record_id join public.cpc1_revisions v on v.record_id=rec.id and v.version=case when r.status='open' then rec.version else i.closed_revision end
 where cpc1_private.record_pq_right(i.record_id,false) and v.version>1 and not exists(select 1 from cpc1_private.history_imports h where h.record_id=i.record_id);
 return historical||fresh;
end$function$;

commit;
