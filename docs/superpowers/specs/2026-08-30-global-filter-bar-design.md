# Global Filter Bar — Compact Botanical Workbench

**Status:** Được hợp nhất vào `2026-08-30-overview-executive-dashboard-design.md`; file này chỉ giữ lịch sử quyết định ban đầu.  
**Scope:** Chỉ `GlobalFilterBar` đầy đủ tại các màn Giám sát và các test trực tiếp của nó. Không thay đổi công thức lọc, URL state, quyền, dữ liệu hoặc bản `rutGon` của nhóm Thực hiện/Phân tích.

## Mục tiêu

Thanh lọc toàn cục phải cho người dùng trả lời nhanh ba câu hỏi theo đúng thứ tự:

1. Tôi đang xem phạm vi nào?
2. Có bao nhiêu điều kiện lọc đang áp dụng?
3. Còn bao nhiêu hạng mục sau lọc?

Mặc định thanh chỉ chiếm một hàng. Hàng chip thứ hai chỉ xuất hiện khi thực sự có điều kiện lọc, tránh một vùng công cụ lớn nhưng rỗng.

## Bố cục đã chọn

### Hàng chính

- Badge phạm vi gọn: icon Filter + `Toàn hệ thống`; giữ `role="group"` và `aria-label="Phạm vi toàn hệ thống"` cho contract hiện có.
- Chọn nhân sự giữ nguyên quyền và dữ liệu hiện hành; chỉ hiển thị khi `showPersonSelector` cho phép.
- Một nút chính `Bộ lọc` với số điều kiện Bộ phận/Khu vực/Ngày đang bật; dùng `aria-expanded` và `aria-controls` trỏ đúng panel.
- Tóm tắt kết quả ở cuối: `shown / total hạng mục`, giữ giải thích mẫu số hiện hành.
- Bỏ hoàn toàn chức năng và giao diện `Chép liên kết`; không thay bằng menu khác.

### Hàng trạng thái có điều kiện

- Chỉ render khi có Bộ phận, Khu vực, Ngày hoặc nhân sự cụ thể.
- Mỗi điều kiện hiện thành chip có nút gỡ với accessible name chính xác.
- Nhân sự đã có giá trị rõ trong select nên không lặp thêm chip nhân sự.
- `Xóa tất cả` nằm cuối hàng chip; reset đúng các state hiện hành và không đổi chế độ Today ngoài contract cũ.

### Panel lọc

- Desktop: popover neo dưới nút Bộ lọc, bề rộng đủ đọc và không che nội dung bằng một cột quá dài.
- Chia ba nhóm rõ bằng `fieldset/legend`: Khoảng thời gian, Bộ phận, Khu vực.
- Điều kiện áp dụng ngay như hiện tại; không tạo draft state hoặc nút “Áp dụng” giả.
- Mỗi lựa chọn là native button với `aria-pressed`, chấm màu chỉ là trang trí và trạng thái còn được thể hiện bằng dấu chọn/text.
- Footer panel hiển thị số kết quả hiện thời và nút `Xong` để đóng.
- `Escape` đóng panel và trả focus về nút Bộ lọc; click ngoài tiếp tục đóng như hiện tại.
- Mobile: panel nằm trong bề rộng viewport, các control tối thiểu 44px, không tràn ngang.

## Ngôn ngữ thị giác

- Dùng token Lotus hiện có: surface, plum, gold, line và focus; không tạo palette mới.
- Một khối nền botanical rất nhẹ, đường viền vàng mảnh và khoảng trắng phân nhóm.
- Nút Bộ lọc là điểm hành động chính; badge phạm vi và số kết quả có độ nhấn thấp hơn.
- Không dùng toàn bộ control dạng pill; pill chỉ dành cho chip trạng thái và badge nhỏ.
- Focus-visible rõ, trạng thái active không chỉ dựa vào màu.

## Dữ liệu và hành vi giữ nguyên

- Giữ nguyên `deptSel`, `areaSel`, `period`, `customFrom`, `customTo`, `selectedPersonId` và mọi setter.
- Giữ cách cập nhật URL/filter population hiện tại tại call-site.
- Không đổi `shown`, `total`, `soNgung` hoặc giải thích mẫu số.
- Không đổi `TodayScopeControl`, quyền chọn nhân sự, hay `GlobalFilterBarLegacy`.
- Không thêm dependency, localStorage, RPC hoặc request mới.

## Accessibility

- Native button/select/input; label/legend rõ ràng.
- Nút mở có `aria-haspopup`, `aria-expanded`, `aria-controls`.
- Panel có tên truy cập được và không dùng menu role sai cho form controls.
- `Escape` đóng và phục hồi focus; Tab đi theo DOM tự nhiên.
- Target mobile ít nhất 44px; focus ring dùng token hiện có.
- Tóm tắt kết quả dùng `aria-live="polite"` để báo thay đổi sau lọc mà không đọc lại toàn bộ panel.

## Kiểm thử chấp nhận

1. Mặc định chỉ một hàng chính, panel đóng và không còn text/button `Chép liên kết`.
2. Nút Bộ lọc mở đúng panel, `aria-expanded`/`aria-controls` khớp.
3. Chọn Bộ phận/Khu vực/Ngày cập nhật đúng population hiện hành và đúng số điều kiện.
4. Gỡ một chip chỉ xóa đúng facet đó; `Xóa tất cả` xóa toàn bộ facet được phép.
5. Escape đóng panel và trả focus về trigger.
6. 390px không tràn ngang, target tương tác ≥43.5px.
7. Targeted unit/E2E, axe Overview, typecheck, build fallback và `git diff --check` đạt.

## Ngoài phạm vi

- Không redesign bộ lọc riêng của Cập nhật, Dữ liệu nguồn, Timeline workbench hoặc Alerts.
- Không thêm tìm kiếm facet, preset đã lưu, đồng bộ server hoặc chia sẻ link.
- Không xóa `GlobalFilterBarLegacy` trong đợt hẹp này.
