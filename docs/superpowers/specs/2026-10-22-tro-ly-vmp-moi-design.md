# Trợ lý VMP mới (thay Vali cũ) — thiết kế

Ngày 22/10/2026. Người dùng đã duyệt hướng làm trong hội thoại.

## Vì sao làm lại

Đo trên log thật (469 câu, 29/07 → 03/09):

- Từ 01/08, workflow n8n `RwSGYBhRasUspZqh` làm mất câu hỏi (128/138 câu tới AI là chuỗi rỗng).
- Cùng câu hỏi ra số khác nhau (quá hạn: 162 rồi 211); có câu bịa mà lớp kiểm chứng vẫn chấm 100.
- Trung vị 10 giây, 3 lần gọi AI mỗi câu; 56% câu do OpenAI trả phí trả lời.
- Groq đã gỡ `llama-3.3-70b-versatile` → 77% lượt gọi Groq lỗi.
- Credential Postgres của n8n đọc toàn bộ 461 hạng mục, bỏ qua quyền người hỏi.

## Nguyên tắc

1. **AI chỉ hiểu câu hỏi, không viết con số.** AI đổi câu hỏi thành `{cong_cu, tham_so}`.
   Câu trả lời (chữ + bảng) do SQL dựng theo mẫu cố định.
2. **Không gửi dữ liệu nhà máy ra ngoài.** API AI (Gemini/Groq bậc miễn phí) chỉ nhận
   nội dung câu hỏi và mô tả công cụ.
3. **Chạy bằng quyền người hỏi.** Web gọi RPC bằng phiên Supabase của chính người dùng;
   tập hạng mục giống hệt tập của `rpc_get_vmp_dashboard` (cùng điều kiện hiển thị).
4. **Cùng cách tính với màn hình.** Quá hạn / sắp đến hạn theo **hạn đích VMP**, ngày
   Bangkok, như ô "Quá hạn đích VMP" ở Tổng quan (`classifyVmpDeadline`).
5. **Người dùng thấy AI đã hiểu gì** ("Tôi hiểu là: Quá hạn · Xưởng sản xuất") và nguồn số.

## Luồng

```
Web (ChatBox) ──câu hỏi + lượt trước──▶ n8n "Vani VMP 9 — Trợ lý hiểu câu hỏi"
                                          ├ kiểm token ô chat + phiên Supabase (/auth/v1/user)
                                          ├ Gemini 3.5 Flash-Lite ─lỗi─▶ Gemini 3.5 Flash ─lỗi─▶ Groq gpt-oss-120b
                                          │   (JSON theo schema; mỗi mô hình một hạn mức miễn phí riêng)
                                          └ lọc: công cụ phải thuộc danh sách, tham số đúng kiểu
Web ◀── {cong_cu, tham_so, kien_thuc?} ──┘
Web ──rpc_tro_ly_tra_loi(cong_cu, tham_so)──▶ Supabase (SECURITY DEFINER, quyền theo auth.uid())
Web ◀── {hieu_la, tra_loi, bang, hoi_lai, goi_y, nguon}
Web ──rpc_tro_ly_ghi_nhat_ky(...)──▶ bảng vmp_tro_ly_nhat_ky (để bổ sung công cụ sau)
```

- Nút gợi ý gọi thẳng RPC, không qua AI.
- n8n lỗi/hết hạn mức → web dùng bộ đoán từ khoá cục bộ (`doanNhanh`) cho các câu phổ biến,
  còn lại báo rõ "Trợ lý AI đang bận, bấm một gợi ý bên dưới".

## Tập hạng mục và định nghĩa

`vmp_tl_hang_muc(p_uid)` (nội bộ): `vmp_plan_items` join `vmp_source_objects` hiển thị được
(`vmp_can_view_source_object`), `year` = năm hiện tại giờ Bangkok, `is_active`,
`not missing_from_sheet`, `item_state = 'active'` (web bỏ cả `cancelled` lẫn `not_applicable`).

- **Xong (VMP):** `actual_vmp_date is not null` hoặc `status_vmp = 'completed'`.
- **Quá hạn:** chưa xong, `deadline_vmp < hôm nay (Bangkok)`.
- **Sắp đến hạn N ngày:** chưa xong, `0 <= deadline_vmp - hôm nay <= N` (mặc định 30).
- **Chưa có hạn:** chưa xong, `deadline_vmp is null`.
- **% hoàn thành:** xong / tổng (làm tròn), như vòng năm ở Tổng quan.
- **Việc của tôi:** `owner_person_id` = `vmp_performers.id` của người hỏi (như Việc hôm nay).

## Công cụ

| Mã | Tham số | Trả lời |
|---|---|---|
| `tong_quan` | — | tổng, xong, %, quá hạn, sắp đến hạn 30 ngày, chưa có hạn |
| `qua_han` | bộ lọc chung | danh sách, quá hạn lâu nhất trước |
| `sap_den_han` | `so_ngay` (1–180, mặc định 30) + bộ lọc | danh sách, gần hạn nhất trước |
| `thiet_bi` | `tu_khoa` | khớp 1 đối tượng → các hạng mục, hạn, trạng thái, người phụ trách, phiếu CC; khớp 2–8 → hỏi lại; 0 → báo không thấy |
| `tien_do` | `theo` (bo_phan/nhom_viec/khu_vuc/loai) + bộ lọc | bảng nhóm: tổng, xong, quá hạn, % |
| `theo_nguoi` | `ten` | hạng mục người đó phụ trách: tổng/xong/quá hạn + danh sách việc mở |
| `viec_cua_toi` | `so_ngay` (mặc định 7) | việc mở của tôi: quá hạn + đến hạn trong N ngày |
| `thay_doi` | `loc` (mo/qua_han/chua_gan/tat_ca), `tu_khoa` | phiếu CC cần thẩm định (tab Thay đổi) |
| `huong_dan` | `chu_de` (danh sách cố định) | nội dung tĩnh trên web |
| `kien_thuc` | — | AI trả lời kiến thức GMP chung; web ghi "Kiến thức chung, không phải SOP nội bộ"; không kèm số liệu nhà máy |
| `chao_hoi` | — | lời giới thiệu tĩnh |
| `khong_ho_tro` | — | "Chưa hỗ trợ câu này" + gợi ý; ghi nhật ký |

Bộ lọc chung (tuỳ chọn): `bo_phan` (xsx/cd/kho/qc/rd/qa), `nhom_viec` (chuỗi, khớp không dấu),
`khu_vuc` (mã, vd C1), `loai` (DQ/FAT/SAT/IQ/OQ/PQ/PV/GSP/GDP), `nguoi` (chuỗi).

Bảng tối đa 50 dòng, kèm `tong_dong`. Ngày hiển thị dd/mm/yyyy.

## Hội thoại nối tiếp

Web gửi kèm `{cong_cu, tham_so}` của lượt trước. AI được dặn: câu dạng "còn xưởng B thì sao"
thì giữ công cụ cũ, đổi tham số.

## Bảo mật

- Hàm RPC `SECURITY DEFINER`, `search_path` cố định, kiểm `vmp_is_active_session`; quyền xem
  qua các hàm hiện có (`vmp_can_view_source_object`, `vmp_change_can_view`). Thu hồi khỏi `anon`.
- Kiểm tham số trong SQL (whitelist mã công cụ, giới hạn độ dài/khoảng số) — không tin đầu ra AI.
- Bảng nhật ký RLS bật, không policy; ghi qua RPC; người dùng chỉ ghi dòng của mình.
- Khoá API chỉ nằm trong credential n8n. Token ô chat công khai giữ vai chặn quét bừa.

## Không làm đợt này

SOP nội bộ / RAG; trạng thái hồ sơ thẩm định thực tế (HT-12…15); tự viết SQL bằng AI;
đề xuất tái thẩm định (bảng `vmp_revalidation_proposals` đang rỗng).

## Hạn mức miễn phí đo được (22/10/2026)

- Gemini 3.5 Flash: 5 lượt/phút, hết hạn mức ngày sau ~25 lượt thử.
- Groq gpt-oss-120b: 8.000 token/phút ≈ 5 câu/phút (lời nhắc ~1.300 token).
- Gemini 3.5 Flash-Lite: đủ cho bộ chấm; làm mô hình chính.
Đủ cho ~8 người dùng hỏi lác đác. Hết cả ba → web đoán từ khoá / mời bấm gợi ý.
Bảng và workflow Vali cũ giữ nguyên; tắt workflow cũ chỉ sau khi người dùng đồng ý.

## Kiểm thử

- SQL: mỗi công cụ so với câu đếm độc lập trên bản sao DB; quyền theo vai (workshop chỉ thấy phạm vi mình);
  tham số xấu bị từ chối; anon bị chặn.
- Hiểu câu hỏi: bộ ≥40 câu tiếng Việt (gồm các câu Vali cũ trả lời sai) → đúng công cụ + tham số chính ≥95%.
- Web: unit cho giải mã hợp đồng + đoán từ khoá; E2E khung chat trên giả lập (hỏi, bảng, hỏi lại, lỗi AI → dự phòng).
