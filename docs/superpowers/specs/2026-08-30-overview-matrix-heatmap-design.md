# Ma trận điểm nghẽn tương phản tinh tế

Ngày: 2026-08-30  
Trạng thái: thiết kế chi tiết được người dùng duyệt ngày 2026-08-30  
Phạm vi: card “Bản đồ trạng thái” trong `MaTranTienDo` trên màn `Overview`

## Mục tiêu

Làm ma trận dễ quét hơn khi nhiều ô đang có độ sáng và sắc độ gần nhau, đồng thời giữ ngôn ngữ Lotus B+ thanh lịch. Người xem phải phân biệt được trạng thái chính của từng ô, đọc được cơ cấu bên trong và tìm điểm nghẽn mà không cần dựa riêng vào màu.

## Nguyên tắc màu

Bốn trạng thái dùng bốn vai trò ngữ nghĩa cố định từ design token hiện có:

- Đã xong: xanh ngọc (`success`).
- Trễ hạn: đỏ mâm xôi (`danger`).
- Thiếu dữ liệu: hổ phách (`warning`).
- Chưa tới hạn: xanh lam (`info`).

Màu trạng thái có ba cấp độ trong cùng một ô:

1. Dải nhấn đậm 4 px ở cạnh trái để quét nhanh.
2. Nền trạng thái pha rất nhạt, không làm giảm tương phản chữ.
3. Màu đậm cho icon, số chính và đoạn tương ứng trong thanh cơ cấu.

Không dùng thêm bảng màu theo giai đoạn vì hai hệ màu cùng lúc sẽ làm người xem nhầm màu cột với màu trạng thái. Dark mode tiếp tục lấy từ semantic token, không dùng literal chỉ phù hợp nền sáng.

## Cấu trúc ô ma trận

Mỗi ô có dữ liệu gồm:

- Dải màu cạnh trái theo trạng thái nặng nhất, giữ thứ tự ưu tiên hiện tại: trễ → thiếu dữ liệu → chưa tới hạn → đã xong.
- Hàng đầu gồm icon, nhãn trạng thái ngắn và số `trạng thái chính / tổng`.
- Thanh cơ cấu bốn màu cao 12 px, các đoạn được ngăn bằng đường màu bề mặt để không hòa vào nhau.
- Accessible name nêu tên hàng/cột và số lượng của mọi trạng thái có mặt.

Ô trống dùng nền trung tính có nét chấm nhẹ, không dùng một màu trạng thái giả. Hover chỉ nâng tương phản của ô đang trỏ; focus bàn phím dùng vòng focus đặc và không bị cắt trong vùng cuộn.

## Bố cục card

Card được chia thành ba tầng:

1. Tiêu đề “Bản đồ trạng thái” và huy hiệu chất lượng dữ liệu ở cùng vùng đầu; trên màn hẹp huy hiệu xuống dòng toàn chiều rộng.
2. Thanh công cụ gồm hai nhóm rõ ràng “Xem theo” và “Cột”, sau đó là ghi chú ngữ cảnh. Trạng thái chọn tiếp tục dùng `aria-pressed`.
3. Chú giải bốn trạng thái dạng chip có icon, chấm màu và nhãn; tổng số hạng mục căn về cuối hàng.

Bảng dùng header có nền trung tính, đường phân cách rõ và khoảng đệm đồng đều. Header và cột tên đầu tiên được ghim trong vùng cuộn ngang; cột đầu có nền riêng để chữ không lẫn với các ô dữ liệu. Các hàng xen kẽ một sắc nền rất nhẹ nhằm giúp mắt đi ngang mà không tạo thêm màu nghiệp vụ.

## Tương tác và accessibility

- Ô dữ liệu tiếp tục là `button`, mở modal danh sách hiện có bằng chuột hoặc Enter/Space.
- Icon, nhãn chữ, số và thanh tỷ lệ cùng truyền đạt trạng thái; màu không phải kênh duy nhất.
- Mọi button có focus-visible tối thiểu 2 px, tương phản ít nhất 3:1 với nền.
- Chữ nhỏ và số đạt WCAG AA trên nền tương ứng; nền trạng thái chỉ dùng tint nhạt.
- Chuyển động hover ngắn và tự tắt khi `prefers-reduced-motion: reduce`.

## Responsive

- Desktop: toolbar và chú giải ưu tiên một hàng khi đủ chỗ; ma trận dùng toàn chiều rộng card.
- Tablet: toolbar và chú giải được xuống dòng theo nhóm, không cắt nhãn.
- Mobile: control cao tối thiểu 44 px; card không làm tràn document; riêng vùng bảng được cuộn ngang.
- Header và cột đầu ghim trong chính vùng cuộn, không ghim vào viewport trang.

## Dữ liệu và phạm vi kỹ thuật

- Không thay đổi `chamGiaiDoan`, `chamHangMuc`, công thức chất lượng dữ liệu, xếp hạng điểm nóng hoặc thứ tự ưu tiên trạng thái.
- Không thay đổi API, RPC, dữ liệu Supabase, quyền truy cập, modal hoặc điều hướng.
- Không thêm thư viện biểu đồ hay dependency.
- Chỉ sửa `MaTranTienDo`, CSS Overview và các kiểm thử mục tiêu trực tiếp liên quan.

## Kiểm thử chấp nhận

1. Chú giải có đúng bốn trạng thái, mỗi trạng thái có icon, nhãn và màu ngữ nghĩa riêng.
2. Ô có dữ liệu mang class/data attribute của trạng thái chính và có accessible name đầy đủ.
3. Bốn màu trạng thái có giá trị computed khác nhau ở nền, dải nhấn và thanh cơ cấu.
4. Thanh cơ cấu cao 12 px và vẫn thể hiện đủ các đoạn có dữ liệu.
5. Header và cột tên đầu tiên dùng sticky trong vùng cuộn ngang.
6. Đổi trục/cột và mở modal từ ô vẫn hoạt động.
7. Focus-visible nhận biết rõ; trạng thái không phụ thuộc riêng vào màu.
8. Ở 390 px, document không tràn ngang, control đạt 44 px và vùng bảng vẫn cuộn cục bộ.
9. Targeted E2E Overview, typecheck, build fallback và diff-check đạt; build chuẩn được báo riêng nếu ACL `.env` tiếp tục chặn.

## Ngoài phạm vi

- Không thiết kế lại toàn bộ không gian phân tích chuyên sâu.
- Không đổi card “Đối tượng cần chú ý nhất” ngoài các khoảng cách cần thiết để thẳng bố cục.
- Không chỉnh KPI, Vòng năm, Vali hoặc biểu đồ so sánh cơ cấu.
- Không sửa luồng xác minh phiên/quyền truy cập.
