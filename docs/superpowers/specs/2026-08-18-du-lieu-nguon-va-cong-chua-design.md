# Thiết kế — Dữ liệu nguồn dễ nhập hơn + Công chúa mắt/miệng lớn hơn

Ngày: 2026-08-18 · Trạng thái: đã duyệt miệng, chờ duyệt spec

## Bối cảnh

Hai việc độc lập, gộp một đợt vì cùng chạm web VMP:

1. Nhân vật Công chúa Vali cần mắt to hơn, miệng lớn hơn.
2. Trang **Dữ liệu nguồn** nhập liệu dễ sai: quá nhiều ô gõ tự do nên dữ liệu
   lệch chính tả, lọc không gom được; ô bắt buộc không được đánh dấu rõ; và
   không có phản hồi thành công/thất bại sau khi lưu.

---

## Phần A — Công chúa Vali

File: `src/components/brand/CongChuaVali.tsx` (chỉ 3 khối: chân mày, mắt, miệng).

| Chi tiết | Hiện tại | Sau |
|---|---|---|
| Tròng mắt | `r 4.6` | `r 6.2` |
| Đốm sáng trong mắt | `r 1.6` | `r 2.2` |
| Lòng trắng mắt | không có | thêm ellipse trắng dưới tròng |
| Vòm mí | cung 26px, sâu 10px | rộng và sâu hơn để không cắt tròng |
| Mắt cười khép (`celebrate`) | cung 24px | tăng biên độ tương ứng |
| Miệng `guide` | cung 22px | ~30px |
| Miệng `concern` | ellipse 4.6×5.4 | 6×7 |
| Miệng `celebrate` | rộng 28px | rộng và sâu hơn ~35% |
| Chân mày | y=119/122 | nhích lên 2px để không đè mắt to |

**Bắt buộc:** cập nhật baseline ảnh TRƯỚC khi deploy (quy trình đã chốt cho mọi
thay đổi giao diện). Bỏ qua là CI đỏ và web không cập nhật.

Không đụng `DungSiVali.tsx` — chỉ công chúa.

---

## Phần B — Dữ liệu nguồn

### B1. Tối đa hoá ô chọn

Thêm kiểu ô **combobox**: `<input list>` + `<datalist>` — chọn từ gợi ý bằng một
cú nhấp, vẫn gõ được giá trị mới. Native, không thêm thư viện, giữ nguyên
`htmlFor` / `aria-describedby` đang có.

Gợi ý sinh từ **dữ liệu thật đang có**, không khai cứng danh mục mới:

| Form | Ô chuyển sang combobox | Nguồn gợi ý |
|---|---|---|
| Đối tượng nguồn | Khu vực, Line, Nhóm công việc | distinct từ `fetchSourceObjects({kind: null, includeInactive: true})` |
| Sản phẩm GMP | Dạng bào chế, Dây chuyền, Bao bì sơ cấp, Bồn pha, Cỡ lô, Hàm lượng | distinct từ một lượt `listDataset` không lọc |
| Người nhận cảnh báo | Giá trị phạm vi | bộ phận/khu vực đã có, lọc theo ô Phạm vi đang chọn |

Hook mới `useCatalogSuggestions` — nạp một lần cho cả workspace, không gọi lại
mỗi lần mở hộp thoại.

**Vì sao không khai cứng:** đây là hồ sơ GMP. Bịa một danh sách khu vực hay dây
chuyền rồi ép người dùng chọn trong đó rủi ro hơn hẳn việc họ gõ tay.

### B2. Bộ phận quản lý — khoá, có lối thoát

- Select khoá theo 6 bộ phận đã khai ở `definitions.ts`: Xưởng sản xuất · Cơ
  điện · Kho · QC · RD · QA.
- Lựa chọn cuối danh sách: **"Bộ phận khác…"** → hiện thêm ô text nhập tên bộ
  phận mới. Ghi vào cùng cột `department`, không thêm cột DB.
- **Bản ghi cũ mang giá trị ngoài 6 bộ phận** phải được hiện lại trong select
  dưới nhãn "Giá trị đang có trong hồ sơ". Không có điều này thì mở form ra là
  giá trị nhảy về rỗng và bấm Lưu ghi đè mất dữ liệu đã ban hành.

### B3. Đánh dấu ô bắt buộc

- Dấu `*` hiện đang `aria-hidden` và không chú giải → thêm nhãn chữ "Bắt buộc",
  gắn `required` / `aria-required` vào ô nhập, thêm một dòng chú thích đầu form.
- Áp dụng cho cả `CatalogField.tsx` và `CatalogObjectForm.tsx`.

### B4. Ô bắt buộc không được nằm trong vùng thu gọn

Lỗi thiết kế hiện tại: nút Lưu bị làm mờ câm lặng (`CatalogRecordDialog.tsx:123`)
khi thiếu ô bắt buộc; dòng "Còn thiếu: …" nằm tít đáy; ô cần điền có thể đang
nằm trong `<details>` Nâng cao đang đóng. Người dùng bấm Lưu, không có gì xảy ra.

1. Chia nhóm theo **tính bắt buộc**, không theo vị trí: bỏ `fields.slice(0, 5)`,
   mọi trường `required` tự động lên nhóm chính.
2. Nút Lưu **không mờ vì thiếu trường** nữa — cho bấm, rồi tự mở phần Nâng cao,
   cuộn tới ô đầu tiên còn thiếu và đặt con trỏ vào đó. (Vẫn mờ khi không có
   thay đổi nào, hoặc không đủ quyền — hai trường hợp đó có lý do hiện rõ.)
3. Nhãn phần thu gọn báo trước: "Nâng cao (6 trường · còn 1 ô chưa điền)".
4. Áp dụng cho cả hai form.

### B5. Phạm vi / Loại cảnh báo — mặc định an toàn thay vì bắt buộc

Ý nghĩa bốn ô của `vmp_alert_recipients`:

| Ô | Ý nghĩa |
|---|---|
| Phạm vi (`scope_type`) | Nhận cảnh báo của những đối tượng nào: Tất cả · Theo bộ phận · Theo khu vực |
| Giá trị phạm vi (`scope`) | Mã cụ thể; để trống nếu "Tất cả" |
| Loại cảnh báo (`alert_kind`) | Quá hạn · Sắp tới hạn · Cả hai |
| Ngưỡng (`threshold_days`) | Báo trước bao nhiêu ngày; chỉ có nghĩa với "sắp tới hạn" |

Để trống Phạm vi thì bảng vẫn hiện người đó "Đang bật" nhưng có thể không nhận
được email nào, không lỗi nào báo — hỏng im lặng.

**Giới hạn đã biết:** việc email có gửi hay không do workflow n8n quyết định,
không đọc được từ web. KHÔNG xác minh được n8n coi ô trống là "gửi tất cả" hay
"không gửi ai". Vì vậy **không** đánh dấu hai ô này bắt buộc.

Thay bằng: **tạo mới đặt sẵn** Phạm vi = "tất cả", Loại cảnh báo = "cả hai".
Ô không bao giờ rỗng, không chặn ai. Bản ghi cũ đang trống thì giữ nguyên giá
trị, chỉ hiện một dòng nhắc nhẹ.

### B6. Nối lại luật đang chết

`src/lib/datasetForm.ts` (kiểm định dạng email, luật "chọn phạm vi bộ phận thì
phải ghi rõ mã") **không được file nào import** — code chết từ thời form cũ.
Hệ quả: email sai định dạng hiện không bị chặn ở form. Nối `validateDatasetForm`
vào `CatalogRecordDialog`.

---

## Phần C — Phản hồi thành công / thất bại

### Hiện trạng

Có một toast nhưng dựng inline trong `App.tsx:2057`, điều khiển bằng state
`saveStatus` của `src/hooks/index.ts:218`, và chỉ một luồng lưu tiến độ dùng nó.
Mọi thao tác ghi ở Dữ liệu nguồn đóng hộp thoại rồi im lặng.

### Thiết kế

1. **`ToastProvider` dùng chung** — `src/components/ui/ToastProvider.tsx`, context
   + hook `useToast()`. API: `toast.thanhCong(msg)`, `toast.loi(msg)`,
   `toast.canhBao(msg)`, `toast.dangChay(msg)` trả handle để chốt kết quả.
   - Giữ nguyên hình thức toast đang có (nổi góc phải, 4 trạng thái, màu theo
     token) để không phá baseline ảnh.
   - Trợ năng: vùng `role="status"` + `aria-live="polite"`; lỗi dùng
     `role="alert"`. Thành công tự tắt sau 2.5s, lỗi 6s và bấm tắt được.
   - Xếp chồng nhiều toast, không đè lên nhau.
2. **Chuyển toast inline của App sang provider** — App không tự vẽ toast nữa,
   `saveStatus` bơm qua `useToast`.
3. **Nối vào mọi thao tác ghi của Dữ liệu nguồn:**

| Thao tác | Thành công | Thất bại |
|---|---|---|
| Tạo/sửa đối tượng nguồn | "Đã lưu {mã}" | câu lỗi server, nêu rõ xung đột phiên bản |
| Tạo/sửa sản phẩm, người nhận | "Đã lưu {khoá}" | như trên |
| Nhập Excel — kiểm tra | "{n} dòng hợp lệ" | "{n} dòng lỗi — xem bảng" |
| Nhập Excel — ghi vào hệ thống | "Đã thêm {a}, cập nhật {b}" | câu lỗi server |
| Áp thay đổi chờ | "Đã áp {n} thay đổi" | câu lỗi server |
| Sinh timeline | "Đã sinh {n} hạng mục" | câu lỗi server |

**Nguyên tắc:** thất bại KHÔNG đóng hộp thoại và KHÔNG mất dữ liệu vừa gõ.

### Ngoài phạm vi đợt này

Các trang khác cũng ghi dữ liệu (Phân quyền, Cấu hình hệ thống, Tiến độ,
Tính lại điểm trọng yếu). Provider dựng xong dùng được ngay cho chúng, nhưng
đợt này chỉ nối Dữ liệu nguồn + luồng lưu tiến độ đang có. Nối nốt phần còn lại
là một đợt riêng, quyết định sau khi thấy đợt này chạy ổn.

---

## Kiểm thử

- Luật thuần (không cần trình duyệt): chia nhóm theo tính bắt buộc, sinh gợi ý
  distinct, mặc định khi tạo mới, giá trị bộ phận lạ vẫn được giữ.
- e2e: mở form thiếu ô bắt buộc trong Nâng cao → bấm Lưu → phần Nâng cao tự mở,
  con trỏ nằm ở ô thiếu.
- e2e: lưu thành công → thấy toast thành công; lưu lỗi → thấy toast lỗi và hộp
  thoại vẫn mở, dữ liệu còn nguyên.
- Ảnh: cập nhật baseline cho công chúa.
- `npm run typecheck` trước build.

## Rủi ro

| Rủi ro | Cách xử |
|---|---|
| Bộ phận khoá cứng làm mất giá trị cũ ngoài danh sách | B2 bắt buộc hiện lại giá trị đang có; có test |
| Gợi ý distinct thiếu vì Sản phẩm GMP đọc phân trang | nạp riêng một lượt không lọc; combobox vẫn cho gõ mới nên thiếu gợi ý không chặn ai |
| Đổi SVG làm CI ảnh đỏ | cập nhật baseline trước, deploy sau |
| Chuyển toast của App sang provider làm hỏng luồng lưu tiến độ | giữ nguyên hình thức và thời lượng; e2e phủ luồng đó |
