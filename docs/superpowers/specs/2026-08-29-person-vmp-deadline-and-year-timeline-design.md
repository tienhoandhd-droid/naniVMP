# Đồng bộ mốc VMP cá nhân và Timeline năm theo tháng

## Mục tiêu

Thực hiện đúng ba thay đổi đã được duyệt:

1. Khi Admin hoặc Quản lý QA chọn một nhân sự, số quá hạn ở **Việc hôm nay** và **Tổng quan VMP** phải dùng cùng nguồn chân lý là mốc VMP (`dl_vmp`).
2. Ở **Sơ đồ dòng thời gian tổng hợp**, chế độ năm chỉ hiển thị tổng hợp 12 tháng. Bảng hạng mục chi tiết chỉ xuất hiện sau khi người dùng mở một tháng.
3. Thành viên thường xem được tổng tiến độ hoàn thành của cả nhóm bên cạnh tiến độ cá nhân, nhưng không nhận danh sách công việc của người khác.

Không thay đổi Timeline 3D, Source, quyền xem chi tiết hiện hành, công thức các giai đoạn khác, bảng hoặc dữ liệu nghiệp vụ trong database.

## 1. Phạm vi cá nhân và mốc VMP

### Nguồn dữ liệu

- Nhân sự vẫn được lọc bằng canonical person ID ở `owner_person_id` hoặc `support_person_id`.
- Bộ phận và khu vực tiếp tục dùng cùng bộ lọc hiện hành.
- Khi đang chọn một nhân sự, Tổng quan dùng cùng tập hạng mục cá nhân với Việc hôm nay và không để bộ lọc kỳ được nhớ trước đó làm mất hạng mục.

### Công thức chung

Một hạng mục là **quá hạn VMP** khi:

- trạng thái bản ghi là `active`;
- VMP chưa hoàn thành;
- có mốc VMP hợp lệ ở `dlVmp`, `deadline_vmp` hoặc `dl_vmp`;
- ngày mốc VMP nhỏ hơn ngày hiện tại theo múi giờ Bangkok.

Không dùng `target` nếu nó chỉ được suy ra từ mốc báo cáo, và không lấy mốc đề cương, thẩm định hoặc báo cáo thay cho mốc VMP. Hạng mục thiếu mốc VMP không bị tính quá hạn VMP.

Việc hôm nay dùng mốc VMP này để xếp các nhóm quá hạn, hôm nay và trong 7 ngày. Tổng quan dùng cùng phân loại cho KPI Quá hạn và danh sách việc gấp. Tỷ lệ hoàn thành vẫn tính trên toàn bộ tập hạng mục của nhân sự đã chọn.

Phạm vi cả nhóm của Tổng quan vẫn giữ hành vi bộ lọc kỳ hiện tại.

## 2. Timeline năm chỉ tổng hợp 12 tháng

### Chế độ năm

- Mặc định hiển thị 12 cột/thẻ tháng trong năm hiện tại.
- Mỗi tháng hiển thị số hạng mục có mốc VMP, số hoàn thành và số cần chú ý.
- Không dựng bảng chi tiết hàng trăm hạng mục, các tab Đề cương/Thẩm định/VMP hoặc inspector trong chế độ năm.
- Hạng mục ngoài năm không xuất hiện trong tổng hợp 12 tháng.

### Mở tháng

- Mỗi tháng có hành động **Mở tháng**.
- Khi bấm, dùng luồng tháng sẵn có: đặt tháng được chọn, chuyển sang chế độ `month`, và chỉ đưa hạng mục có mốc VMP trong tháng vào bảng chi tiết.
- Ở chế độ tháng, bảng, các tab mốc và inspector hoạt động như hiện tại.
- Nút **Năm** đưa người dùng về tổng hợp 12 tháng và ẩn lại chi tiết.

## 3. Tổng tiến độ nhóm cho thành viên thường

- Mọi vai trò đang có quyền xem Tổng quan VMP nhận thêm một payload tổng hợp tối thiểu cho năm hiện tại: tổng số hạng mục active, số đã hoàn thành VMP và tỷ lệ hoàn thành.
- Payload không chứa mã hạng mục, tên đối tượng, tên người phụ trách hoặc danh sách công việc. Quyền chi tiết hiện hành không được mở rộng.
- Tổng quan của thành viên thường hiển thị đồng thời:
  - **Tiến độ cả nhóm**: phần trăm và `đã hoàn thành / tổng hạng mục` từ payload tổng hợp;
  - **Tiến độ của tôi**: phần trăm và `đã hoàn thành / tổng hạng mục` từ tập hạng mục cá nhân hiện có.
- Admin và Quản lý QA tiếp tục dùng bộ chọn Cả nhóm/từng nhân sự đã có; không thêm một control trùng lặp.
- RPC tổng hợp phải fail-closed với phiên không hoạt động hoặc tài khoản không có quyền xem Overview. Không dùng việc mở rộng RPC dashboard chi tiết để lấy số tổng hợp.

## Kiểm thử

### RED/GREEN cho phạm vi cá nhân

- Fixture có một hạng mục của Hoàn với mốc giai đoạn đã trễ nhưng `dl_vmp` chưa trễ: hai màn đều không đếm quá hạn.
- Fixture có một hạng mục của Hoàn với `dl_vmp` đã trễ và VMP chưa xong: hai màn cùng đếm quá hạn.
- Hạng mục support của Hoàn được tính bằng person ID; người trùng tên nhưng khác ID không được tính.
- Bộ lọc kỳ cũ không làm lệch phạm vi cá nhân giữa hai màn.
- Mốc giai đoạn trễ nhưng thiếu/chưa trễ mốc VMP không được tính quá hạn VMP.

### RED/GREEN cho Timeline

- Chế độ năm render đúng 12 tháng và không render bảng chi tiết.
- Bấm một tháng chuyển sang `month`, chỉ còn dữ liệu mốc VMP của tháng đó và bảng chi tiết xuất hiện.
- Quay về `year` ẩn bảng chi tiết.
- Chế độ tháng/quý hiện có tiếp tục hoạt động.

### RED/GREEN cho tổng tiến độ nhóm

- Thành viên thường nhận đúng `completed / total / rate` nhưng payload không có chi tiết hạng mục hoặc nhân sự.
- Phiên không hoạt động và vai trò không có quyền Overview bị từ chối.
- UI thành viên thường hiển thị cả tiến độ nhóm và tiến độ cá nhân; Admin/Quản lý QA không có control trùng.

## Triển khai và hoàn tác

- Thay đổi được giới hạn ở helper phân loại mốc VMP, kết nối dữ liệu trong `App.tsx`, Timeline năm, một RPC tổng hợp không trả chi tiết và các test tương ứng.
- Có một migration bổ sung RPC tổng hợp; không thay đổi bảng hoặc dữ liệu nghiệp vụ.
- Có thể hoàn tác bằng cách revert commit tính năng; không có dữ liệu cần khôi phục.
- Trước deploy: unit, typecheck, SQL contract, E2E Today/Overview, E2E Timeline, build, review độc lập. Sau push `main`: triển khai migration theo runbook, theo dõi Quality and Deploy và xác minh GitHub Pages.
