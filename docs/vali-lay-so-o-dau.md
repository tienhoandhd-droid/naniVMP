# Vali lấy số ở đâu — và vì sao có lúc lấy sai

Tài liệu này dành cho người sau kiểm tra khi Vali trả lời sai số. Đọc
xong sẽ biết con số trong câu trả lời đến từ chỗ nào, và chỗ nào từng
hỏng.

## 1. Ba nguồn số, đừng lẫn

| Nguồn | Cho ra gì | Dùng khi nào |
|---|---|---|
| `rpc_ai_context` / `rpc_ai_context_gon` | Số **toàn nhà máy** + một **danh sách MẪU** vài dòng đã bị cắt | Hỏi về toàn bộ kế hoạch |
| `rpc_ai_thong_ke_loc` | Số **đếm thật** cho đúng người / nhóm / khu vực được hỏi | Hỏi về một đối tượng cụ thể |
| `rpc_tim_tri_thuc` | Mảnh tài liệu luật, không có số | Hỏi vì sao, quy tắc, chuẩn GMP |

**Cái bẫy lớn nhất của cả hệ:** nguồn thứ nhất trả về một danh sách mẫu.
Mô hình nhìn thấy 8 dòng rồi báo "có 8 hạng mục". Ba lần sai thật đã gặp
đều từ đây:

- *"hệ thống tank có 461 hạng mục"* — lấy nhầm số toàn nhà máy.
- *"Nhi có 8 hạng mục"* — đếm trên danh sách mẫu; thật ra 22.
- *"line BFS có 8 hạng mục"* — cũng đếm trên mẫu; thật ra 37.

Vì vậy mọi câu hỏi có đối tượng cụ thể **bắt buộc** đi qua công cụ
`Dem dung theo nhom` (gọi `rpc_ai_thong_ke_loc`), và kết quả được nhét
thẳng lên **đầu** phần ghi chú dưới nhãn `[SỐ LIỆU ĐÃ CHỐT BẰNG SQL]`.

## 2. Cách tự kiểm tra một câu trả lời

Chạy đúng ba lệnh này là biết Vali đúng hay sai:

```sql
-- 1. Hệ có nhận ra đang hỏi về ai/cái gì không?
select jsonb_pretty(public.rpc_ai_hieu_tu_khoa('câu hỏi của người dùng', 8));

-- 2. Con số thật là bao nhiêu?
select jsonb_pretty(public.rpc_ai_thong_ke_loc('câu hỏi của người dùng'));

-- 3. Câu kết luận SQL đã chốt là gì?
select t ->> 'cau_tra_loi_goi_y'
from jsonb_array_elements(public.rpc_ai_thong_ke_loc('câu hỏi') -> 'thong_ke') t;
```

Nếu lệnh 2 ra đúng mà Vali nói khác → lỗi ở tầng mô hình, sửa bằng sổ
tay giọng. Nếu lệnh 2 đã sai → lỗi ở tầng dữ liệu, sửa SQL. Đừng sửa
prompt khi lỗi nằm ở SQL, và ngược lại.

## 3. Quá tải ≠ quá hạn

Đây là chỗ AI lộn nhiều nhất, và người cũng hay lộn:

- **Quá hạn** nhìn về **quá khứ** — việc đã trôi qua ngày phải xong.
  Đếm bằng `computed_status = 'over'`.
- **Quá tải** nhìn về **tương lai** — đang ôm nhiều việc hơn sức làm.
  Đo bằng số việc chưa xong so với trung bình mỗi người.

Một người có thể **không quá tải mà vẫn có việc quá hạn** (Phạm Huệ Nhi:
chủ trì 13 việc, dưới trung bình 41,7 — nhưng có 8 việc quá hạn), và
ngược lại (Lê Xuân Đức: 12 việc chủ trì, 0 quá hạn).

## 4. Chủ trì khác hỗ trợ

`owner_name` là **chủ trì** — người chịu trách nhiệm. `secondary_owner`
là **hỗ trợ** — được ghi tên kèm. Hai vai nặng nhẹ khác hẳn nhau.

Lê Xuân Đức chủ trì 12 việc nhưng đứng hỗ trợ **80** việc. Cộng chung
thành 92 rồi đem so với trung bình 41,7 (vốn chỉ đếm chủ trì) thì ra
"quá tải gấp đôi" — sai bản chất, không chỉ sai số. Nay mọi con số chính
đếm theo chủ trì, phần hỗ trợ nói riêng một câu.

## 5. Hỏi một phần thì vẫn phải ra

Người dùng gõ "tank", "nồi hấp", "BFS", "QA" chứ không gõ trọn tên. Ba
luật xử lý:

1. **Khớp chiều ngược** — lấy từng tiếng trong câu hỏi tìm xem nó nằm
   trong tên/mã nào, chứ không lấy tên trong từ điển đi tìm trong câu.
2. **Cụm dài hơn thì cụ thể hơn** — "máy ép vỉ" (7 ký tự) thắng "máy"
   (3 ký tự), nên chỉ còn Máy Ép Vỉ chứ không phải 58 cái máy.
3. **Trúng nhiều giá trị thì GỘP** — "BFS" trúng BFS, BFS-W, BFS-R thì
   đếm cả ba rồi nói rõ đã gộp những gì. Bản đầu đòi phải trúng đúng một
   giá trị, nên câu này trả về rỗng và AI quay sang lấy số toàn nhà máy
   — rơi lại đúng cái bug ban đầu.

Ba trường hợp riêng cần biết:

- Tên người một tiếng ("Hằng") trùng với hư từ ("hạng mục") nên có một
  đường dò riêng **không lọc hư từ** dành cho tên người.
- Mã hai ký tự (`qa`, `qc`, `cd`, `IQ`, `OQ`) có đường dò riêng đòi
  **trùng khít**, vì ngưỡng chung là ba ký tự.
- Bí danh dân dã (`kcs` → qc, `buồng cân` → nhóm LAF) nằm ở bảng
  `vmp_ai_bi_danh`, chép tay vì không suy ra được từ dữ liệu.

Đo bằng bộ 50 câu hỏi mô phỏng: trước khi sửa **17 câu** không khoanh
được về đối tượng nào; sau khi sửa còn **4 câu**, và cả bốn đều là câu
hỏi toàn nhà máy nên trượt là đúng ("ai ôm nhiều việc nhất", "30 ngày
tới có gì gấp").

## 6. Bài học lặp đi lặp lại

**Mô hình nhỏ không làm số học và không tự phán ngưỡng.**

Thử ba vòng đều hỏng theo cùng một kiểu: đưa `so_lan_so_voi_trung_binh
= 0.31` kèm lời dặn "dưới 1 là nhẹ hơn mặt bằng", gpt-4o-mini vẫn kết
luận "Nhi đang quá tải rõ rệt" — vì nó nhìn thấy 13 việc, 8 quá hạn,
thấy nhiều, nên phán theo cảm giác.

Chỉ hết khi SQL **kết luận sẵn bằng lời** trong ô `cau_tra_loi_goi_y`,
mô hình chỉ việc chép lại. Nguyên tắc rút ra: cái gì quy được thành luật
đếm được thì để SQL quyết; mô hình chỉ lo diễn đạt.

Hệ quả thực tế: khi thêm bất kỳ chỉ số mới nào cho Vali, hãy trả về
**cả con số lẫn câu kết luận**, đừng chỉ trả con số rồi dặn cách đọc.

## 7. Chỗ dữ liệu đang thiếu — phải nói thật, không được suy bừa

**85 hạng mục đang ở trạng thái "hoàn thành" nhưng KHÔNG có ngày hoàn
thành thực tế** — cả ba cột ngày thực tế đều trống.

Hệ quả: không tính được kỳ tái thẩm định từ ngày làm thật. Tần suất có
sẵn ở `vmp_objects.frequency_months` (phần lớn 12 tháng, một số hệ 6, 3
hoặc 36), nên chỉ suy được kỳ kế tiếp **theo kế hoạch** — lấy hạn VMP
cộng tần suất. Vali được dặn phải nói rõ đây là tính theo kế hoạch chứ
không phải từ ngày làm thật.

Muốn Vali trả lời chắc chắn về tái thẩm định thì phải bổ sung ngày hoàn
thành thực tế vào hồ sơ. Đây là việc của người, không phải của AI.

Và VMP **không có số đo vận hành** — không có áp suất, lưu lượng, lượng
tiêu thụ khí nitơ. Hỏi "thừa khí nitơ không" thì Vali phải nói thật là
chỗ đó nằm ở hệ giám sát môi trường/BMS, rồi đưa cái nó có: hệ đó đã
thẩm định tới đâu, kỳ tái thẩm định bao lâu một lần.

## 8. Cache ngữ nghĩa — nhanh nhưng không được sai

Câu hỏi lặp ("bao nhiêu quá hạn", "tank đến đâu") đi qua đủ ba lớp AI mất
10–30 giây. Học `semantic_cache` của dự án Du_bao_thoi_tiet: lưu câu trả
lời theo vector câu hỏi, câu lặp trả trong ~1 giây (`vmp_ai_cache_ngu_nghia`).

Đo thật: lần đầu 18,7s → lần lặp **1,05s**, web hiện nhãn "💾 dữ liệu chưa
đổi nên dùng lại" cho người đọc biết đây là câu dùng lại.

Bốn van an toàn — vì câu trả lời VMP **đổi theo thời gian**:

1. **Dữ liệu đổi là cache chết ngay** — trigger mức lệnh trên
   `vmp_plan_items` và `vmp_objects`. Đã kiểm chứng: một lệnh UPDATE
   (kể cả 0 dòng) vô hiệu toàn bộ cache số liệu, câu hỏi sau đó tra mới.
2. **Sống tối đa 6 giờ và không qua ngày** — "còn 9 ngày" sang mai là sai
   dù không ai đụng dữ liệu.
3. **Ngưỡng giống 0,93** — chỉ nhận câu gần trùng hẳn; "tiến độ hệ thống
   tank thế nào" khác "hệ thống tank đến đâu rồi" thì vẫn tra mới.
4. **Không cache câu cá nhân** — "việc của tôi", "ta là ai" mà trả cho
   người khác là lộ chuyện riêng; hàm lưu tự chối.

Xem cache đang sống: `select cau_hoi, hit_count, created_at from
vmp_ai_cache_ngu_nghia where is_valid;` — nghi ngờ thì
`update vmp_ai_cache_ngu_nghia set is_valid = false where is_valid;`
là toàn bộ về đường tra mới, không cần sửa workflow.
