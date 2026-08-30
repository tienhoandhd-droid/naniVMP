# Monitoring Journey — bộ ba Giám sát nghệ thuật, dễ dùng và có chiều sâu

## 1. Mục tiêu

Nâng ba màn trong nhóm **GIÁM SÁT** thành một hành trình thống nhất:

1. **Tổng quan VMP** trả lời “Có chuyện gì?”.
2. **Dòng thời gian VMP** trả lời “Kẹt ở đâu và khi nào?”.
3. **Cảnh báo & ưu tiên** trả lời “Cần xử lý gì trước?”.

Thiết kế phải tăng mạnh tính nghệ thuật theo ngôn ngữ Botanical Intelligence nhưng mọi hình ảnh đều phải truyền đạt dữ liệu. Không thêm trang trí làm giảm khả năng đọc, không biến 3D thành con đường duy nhất để hoàn thành tác vụ, và không thay đổi quyền hay công thức nghiệp vụ hiện hành.

## 2. Bằng chứng hiện trạng

Khảo sát local ở viewport 1440×900 với fixture Admin cho thấy:

- Tổng quan ghi **14 Quá hạn** vì đang đếm hạng mục trễ mốc đích VMP.
- Timeline và Cảnh báo ghi **21 Quá hạn** vì đang đếm hạng mục có trạng thái tổng hoặc bất kỳ pha nào trễ.
- Ba con số đều có lý do nghiệp vụ, nhưng cùng nhãn “Quá hạn” khiến người dùng dễ hiểu là hệ thống tính sai.
- Các KPI lớn bị lặp giữa ba màn, trong khi vai trò riêng của từng màn chưa nổi bật.
- Timeline đã có `WorkloadSpace3D`; QRM đã có `RiskSpace3D`. Cả hai dùng React Three Fiber, lazy-load và có lớp bảo vệ WebGL, nhưng đang đứng như khối khám phá phụ thay vì tham gia rõ vào luồng phân tích.
- Cảnh báo có chức năng mạnh nhưng dải KPI, cảnh báo giải thích và thanh lọc chiếm nhiều chiều cao; emoji KPI chưa đồng nhất với hệ icon Lotus.
- “Vấn đề dữ liệu” có thể hiện tổng số lỗi và riêng số lệch pha trong cùng thẻ, nhưng câu chữ hiện tại chưa giải thích quan hệ giữa hai số.

## 3. Nguyên tắc thiết kế

### 3.1 Một hành trình, ba vai trò

Mỗi màn giữ một câu hỏi chính và một hành động chuyển tiếp. Không sao chép nguyên dải KPI của màn trước sang màn sau.

```text
Tổng quan VMP              Dòng thời gian               Cảnh báo & ưu tiên
Có chuyện gì?      →       Kẹt ở đâu, khi nào?   →     Cần xử lý gì trước?
      └──────── Phạm vi chung hiện hành được giữ xuyên suốt ────────┘
                                             ↓
                                Việc hôm nay / Cập nhật tiến độ
```

### 3.2 Nghệ thuật phải mang nghĩa

- Vòng năm biểu diễn nhịp tiến độ theo 12 tháng.
- Địa hình biểu diễn tải Tháng × Bộ phận × Số hạng mục.
- Cánh sen/ma trận biểu diễn vùng rủi ro QRM.
- Plum dùng cho cấu trúc, raspberry cho nguy hiểm, gold cho chú ý, mint cho ổn định.
- Không dùng ảnh hoặc màu làm nguồn thông tin duy nhất; mọi tín hiệu có số, nhãn hoặc biểu tượng tương đương.

### 3.3 Giám sát vẫn là vùng chỉ đọc

Ba màn không thêm mutation. CTA “Cập nhật” hoặc “Xử lý” chỉ điều hướng sang **Việc hôm nay** hoặc **Cập nhật tiến độ**, giữ kiểm quyền hiện hành ở màn đích. Không thêm RPC, migration hay mở rộng dữ liệu được phép xem.

### 3.4 Một thông tin chỉ có một chủ sở hữu thị giác

- Một metric chỉ được làm hero ở đúng màn trả lời câu hỏi của nó; màn khác chỉ dùng nhãn tóm tắt nhỏ khi cần điều hướng.
- Tỷ lệ hoàn thành thuộc hero Tổng quan, không lặp thành KPI lớn bên cạnh.
- Quá hạn theo pha thuộc Timeline; rủi ro cao thuộc Cảnh báo.
- Bộ lọc chung không được dựng lại thành một thanh lọc thứ hai trong nội dung màn. Bộ lọc cục bộ chỉ hiện các điều kiện riêng của màn và nằm trong một disclosure khi không phải thao tác thường xuyên.
- Mỗi vùng tác vụ chỉ có một CTA chính. Export, chia sẻ, 3D và phân tích AI là hành động phụ, không cạnh tranh màu/độ nổi với CTA chính.
- Nếu hai khối dùng cùng số liệu và cùng dẫn đến một đích, gộp chúng; nếu khác định nghĩa, đổi nhãn để sự khác biệt đọc được ngay.

## 4. Thành phần dùng chung: Monitoring Journey Switcher

Đầu mỗi màn Giám sát có một cụm ba thẻ điều hướng gọn, nằm dưới hero header và bộ lọc chung.

Mỗi thẻ gồm:

- icon vector Lucide;
- tên màn;
- một chỉ số chữ ký không trùng nghĩa;
- một câu mô tả ngắn;
- trạng thái active bằng nền, viền và `aria-current="page"`.

Chỉ số chữ ký:

| Thẻ | Chỉ số | Nhãn bắt buộc |
| --- | --- | --- |
| Tổng quan | số trễ mốc đích VMP | `Trễ đích VMP` |
| Timeline | số có ít nhất một pha trễ | `Có pha bị trễ` |
| Cảnh báo | số rủi ro cao chưa đóng | `Rủi ro cao cần xem` |

Không dùng chung nhãn “Quá hạn” cho ba định nghĩa. Tooltip/trợ giúp giải thích nguồn tính, nhưng nhãn chính tự nó phải đủ rõ.

Desktop dùng grid ba cột. Tablet cho phép 1.15/1/1 để active card nổi nhẹ. Mobile dùng ba tab full-width hoặc cuộn ngang có snap; mỗi vùng bấm tối thiểu 44px và không giấu tên màn.

Component dự kiến:

- `features/monitoring/MonitoringJourneyNav.tsx` — chỉ trình bày và điều hướng.
- `features/monitoring/monitoringMetrics.ts` — helper thuần đặt tên và tính ba chỉ số từ tập `Activity` đã được phép xem.
- `features/monitoring/monitoring.css` — visual scope riêng, không rò sang dashboard khác.

## 5. Tổng quan VMP — Vườn sức khỏe kế hoạch

### 5.1 Thứ tự hiển thị

1. Monitoring Journey Switcher.
2. Hero vòng năm + kết luận tiến độ.
3. Ba thẻ hỗ trợ: Trễ đích VMP, tới hạn 30 ngày, chất lượng dữ liệu.
4. Việc gấp nhất.
5. Phân tích chi tiết đóng mặc định.

Tỷ lệ hoàn thành không lặp thành một KPI ngang hàng vì đã là con số trung tâm của hero.

### 5.2 Hero

Giữ vòng năm hiện có và tăng vai trò kể chuyện:

- số hoàn thành/tổng;
- nhịp trung bình cần đạt trong số tháng còn lại;
- tháng tải cao nhất;
- so sánh với kế hoạch hiện hành nếu dữ liệu đã có, không phát minh baseline mới.

Kết luận chỉ có một thông điệp chính và tối đa hai câu hỗ trợ. Công chúa Vali không lặp lại nguyên dải KPI; Vali đưa một khuyến nghị ưu tiên dựa trên cùng dữ liệu.

### 5.3 Chất lượng dữ liệu

Thẻ “Vấn đề dữ liệu” tách rõ tổng và thành phần:

- thiếu mốc/ngày;
- lệch trạng thái;
- thiếu phân công hoặc dữ liệu trọng yếu nếu check hiện hành có cung cấp.

Không thay đổi `runDataQualityChecks`; chỉ trình bày các nhóm thực sự có trong kết quả. CTA dùng `overviewTarget` và quyền hiện hành.

## 6. Dòng thời gian — Địa hình kế hoạch

### 6.1 Mặt đầu

- Monitoring Journey Switcher.
- Dải metric gọn thay cho bốn card cao bằng nhau.
- Câu kết luận “Nặng nhất / Nút thắt” trở thành action narrative nổi bật.
- Hai CTA: mở đúng hạng mục và lọc đúng pha/bộ phận khi callback hiện hành hỗ trợ.

Không đổi công thức `timelineFilterModel`, phạm vi năm/tháng hay quyền inspector.

### 6.2 2D và 3D

2D là mặc định và là nguồn chức năng đầy đủ. 3D là lớp khám phá có kiểm soát:

- lazy-load chỉ khi mở;
- `frameloop="demand"` và DPR giới hạn như hiện tại;
- click cell dùng callback hiện có để mở đúng Tháng × Bộ phận;
- hover/focus ngoài canvas hiển thị tổng, quá hạn và tỷ lệ hoàn thành;
- có `Đặt lại góc nhìn`, preset `Theo tháng`, `Theo bộ phận`, `Điểm nóng` nếu kiến trúc camera hiện hành hỗ trợ mà không viết lại renderer;
- mobile mặc định heatmap/bảng 2D; 3D chỉ mở khi thiết bị hỗ trợ;
- khi WebGL không khả dụng, hiện giải thích ngắn và giữ nguyên heatmap/bảng 2D.

Canvas là bổ trợ. Một bảng/heatmap semantic dùng cùng dữ liệu phải luôn tồn tại để bàn phím và trình đọc màn hình thực hiện được tác vụ tương đương.

### 6.3 Đồng bộ lựa chọn

Biểu đồ tháng, thanh bộ phận, heatmap/3D và bảng Timeline cùng tiêu thụ một mảng đã lọc. Khi click một điểm dữ liệu, selection không được làm số KPI và danh sách dùng hai population khác nhau.

Không thêm URL state hoặc localStorage mới. Bộ lọc chung hiện có trong `App` tiếp tục được giữ khi đổi màn; filter cục bộ của Timeline vẫn cục bộ theo hợp đồng trước. Focus chuyển màn, nếu có, là state tạm có kiểu rõ ràng và được bỏ khi record không còn trong phạm vi.

## 7. Cảnh báo & ưu tiên — Bàn điều phối rủi ro

### 7.1 Mặt đầu

- Monitoring Journey Switcher.
- Ba tầng thay vì bốn KPI lớn: `Cần xử lý ngay`, `Theo dõi 30 ngày`, `Rủi ro cao cần QA xem`.
- Tái thẩm định chỉ hiện thành tầng riêng khi có dữ liệu; khi bằng 0, đưa vào tóm tắt phụ để không chiếm một card lớn.
- Dùng Lucide/vector, bỏ emoji phụ thuộc hệ điều hành.

### 7.2 Bộ lọc và danh sách

- Dòng một: bộ phận, mức rủi ro, người phụ trách, thời gian.
- Dòng hai hoặc disclosure: tìm kiếm, xếp thứ tự, xuất CSV.
- `Gom theo đối tượng` và `Theo từng hạng mục` là toggle có nhãn rõ, không dùng câu mơ hồ “Đang gom cụm”.
- Chip đang lọc có tên truy cập cụ thể và một nút xóa toàn bộ.
- Mỗi dòng nói rõ lý do ưu tiên: `RPN · số ngày trễ · pha đang kẹt · người phụ trách`.

CTA trong danh sách chỉ đọc:

- mở timeline chi tiết;
- mở tập đã lọc ở Việc hôm nay nếu màn đích và quyền cho phép;
- mở bản ghi ở Cập nhật tiến độ nếu có quyền;
- xuất dữ liệu hiện hành.

### 7.3 QRM và AI

Tab QRM giữ `RiskSpace3D`, nhưng áp cùng hợp đồng 2D-first, lazy-load, reduced-motion và fallback như Timeline.

AI chỉ tạo bản nháp có nguồn bản ghi và thông báo `Cần QA xác nhận`. Không tự gửi mail. Khi webhook chưa cấu hình, người dùng nghiệp vụ thấy trạng thái vô hiệu hóa ngắn; chi tiết biến môi trường chỉ hiện cho Admin trong Cấu hình hệ thống, không chiếm nội dung chính của Cảnh báo.

Đợt frontend này không xây backend AI, không đổi endpoint và không gửi dữ liệu ra ngoài.

## 8. Dữ liệu và điều hướng

- Dùng `Activity[]` đã được `App` lọc theo quyền, phạm vi và bộ lọc chung.
- Không fetch thêm danh sách chi tiết chỉ để dựng switcher.
- Metric mới phải gọi helper nghiệp vụ hiện có thay vì tự viết công thức deadline thứ hai.
- Mapping điều hướng tiếp tục fail-closed qua `overviewTarget`/`access.canView`.
- Nếu màn đích không xem được, CTA không render; không điều hướng về một màn mặc định gây hiểu nhầm.

## 9. Accessibility và responsive

- WCAG 2.2 AA cho tương phản, focus và nhãn.
- Điều hướng ba thẻ là `<nav>` với button/link semantic và `aria-current`.
- Metric có nhãn chữ và icon; không dùng màu đơn độc.
- Dynamic result/count dùng live region lịch sự, không đọc lại toàn trang.
- Mọi control chạm trên mobile tối thiểu 44px.
- `prefers-reduced-motion` tắt chuyển động trang trí và camera tự động.
- 3D có bảng/heatmap tương đương; keyboard không phải thao tác trực tiếp trong canvas để hoàn thành tác vụ.
- 1440px, 1024px và 390px không tràn ngang; thứ tự DOM trùng thứ tự nhìn.

## 10. Hiệu năng

- Không thêm thư viện chart/3D; dùng React Three Fiber, Three.js và primitives hiện có.
- Giữ lazy import cho `WorkloadSpace3D` và `RiskSpace3D`.
- Không mount hai canvas 3D cùng lúc.
- CSS nghệ thuật dùng token, gradient và pseudo-element; không thêm bitmap nền lớn trong vòng đầu.
- Animation chỉ dùng opacity/transform trong 160–220ms.
- Memo hóa metric/helper thuần theo tập `Activity` đã lọc; không tối ưu bằng `useMemo` nếu không có phép tính hoặc render thực sự đáng kể.

## 11. Công cụ sử dụng trong triển khai

- **React Grab**: người dùng chọn đúng component để tinh chỉnh; mọi grab mới được xử lý theo đúng source reference.
- **UI Design / Dashboard Layout / Accessible Components**: giữ hierarchy, responsive và WCAG.
- **Agent Browser**: ưu tiên snapshot, screenshot, accessibility và exploratory test. Trên máy hiện tại, CLI doctor pass nhưng Chrome launch chưa tạo DevTools port; dùng browser harness Puppeteer/Playwright của dự án làm fallback cho tới khi launcher được sửa.
- **Playwright/Puppeteer + axe**: E2E, visual regression, mobile và a11y.
- **Image generation**: không dùng mặc định. Chỉ tạo ornament/texture sau khi người dùng duyệt visual riêng; dữ liệu không bao giờ được raster hóa thành ảnh trang trí.

## 12. Kiểm thử nghiệm thu

### Unit

- Ba metric chữ ký dùng đúng ba định nghĩa và nhãn không trùng “Quá hạn”.
- Điều hướng fail-closed theo quyền.
- Tổng quan, Timeline và Alerts không tạo công thức deadline song song.
- Gom nhóm cảnh báo và count dùng cùng filtered population.

### E2E mục tiêu

1. Overview → Timeline: bấm `Có pha bị trễ`, màn đích mở đúng ngữ cảnh được phép.
2. Timeline → Alerts: mở tập rủi ro/cảnh báo và giữ phạm vi chung.
3. Alerts → Progress/Today: CTA chỉ xuất hiện khi có quyền và mở đúng record/tập lọc.
4. Chuyển 2D/3D; khi WebGL vắng, 2D vẫn thao tác được.
5. Mobile 390px: switcher, filter và danh sách không overflow; control ≥44px.
6. Không có request ngoài các boundary hiện hành trong fixture nghiêm ngặt.

### Gate

- targeted unit;
- một E2E hành trình Giám sát;
- E2E Timeline/QRM 3D hoặc fallback liên quan;
- visual snapshots 1440/1024/390;
- axe cho ba màn;
- typecheck, build và `git diff --check`.

Không tự chạy broad E2E ngoài phạm vi trừ khi shared boundary thực sự đổi.

## 13. Phạm vi và không làm

Trong phạm vi:

- hierarchy, copy, shared switcher, visual scoped CSS;
- đồng bộ presentation của ba màn;
- 2D/3D discovery UX và fallback;
- read-only deep links theo quyền;
- test mục tiêu.

Ngoài phạm vi:

- database/RPC/migration;
- sửa công thức deadline, RPN hoặc quyền;
- backend AI hoặc tự gửi mail;
- redesign Việc hôm nay, Progress, Source, Reports hoặc Workload;
- thêm thư viện chart/3D;
- URL filter state hoặc localStorage persistence mới;
- viết lại toàn bộ Timeline/QRM renderer.

## 14. Tiêu chí hoàn tất

Feature chỉ hoàn tất khi:

- người dùng phân biệt được `Trễ đích VMP`, `Có pha bị trễ` và `Rủi ro cao cần xem` mà không cần đoán;
- ba màn tạo thành một luồng điều hướng rõ ràng;
- mỗi màn có một hierarchy riêng, không lặp dải KPI vô nghĩa;
- visual Botanical Intelligence tăng tính nghệ thuật nhưng không che dữ liệu;
- 3D hữu ích khi có WebGL và 2D vẫn đầy đủ khi không có;
- quyền, filtered population và record mapping không đổi;
- các gate mục tiêu pass và không có thay đổi Timeline/Alerts lan sang màn ngoài phạm vi.
