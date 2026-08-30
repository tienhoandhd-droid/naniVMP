# Thiết kế nghệ thuật “Long Môn VMP – cuộc đua ngược dòng”

## 1. Mục tiêu

Tạo một bản đồ thời gian VMP mang cảm giác của cuộc đua thực sự: mỗi thiết bị là một cá chép đang thắng dòng nước để kịp hạn VMP. Tranh phải có giá trị thẩm mỹ độc lập nhưng vẫn dành đủ khoảng trống và độ tương phản cho dữ liệu giao diện.

## 2. Phạm vi bản thử

- Tạo một tranh nền đường đua thủy cảnh không chứa cá dữ liệu, chữ hoặc nhãn.
- Tạo một bộ tham chiếu cá chép tròn, hơi béo, đang bơi mạnh sang phải.
- Dùng các tài sản mới trong một prototype Visual Companion độc lập.
- Không sửa `src/`, API, quyền truy cập, dữ liệu hoặc quy tắc nghiệp vụ.
- Không dùng số liệu minh họa để kết luận nghiệp vụ GMP.

## 3. Ý niệm và hướng chuyển động

- Góc nhìn ngang dưới mặt nước, không dùng góc nhìn từ trên cao.
- Thời gian chạy từ trái sang phải.
- Dòng nước chuyển động từ phải sang trái; cá hướng sang phải để thể hiện đang thắng dòng.
- Đích thị giác nằm gần một phần ba bên phải, được gợi bằng vùng sáng và một khe đá thanh thoát; không dựng cổng trang trí cầu kỳ.
- Đường “Hôm nay” của giao diện đóng vai trò mốc chấm điểm: cá quá hạn nằm phía trước mốc thời gian đã qua nhưng chưa hoàn tất; cá tương lai đang tiến đến hạn.

## 4. Tranh nền

### 4.1. Bố cục

- Khổ ngang rộng, tương thích với vùng timeline ba tháng.
- Đá và thực vật chỉ đóng khung ở mép trên, mép dưới và hai đầu; vùng giữa dành cho cá dữ liệu.
- Dòng nước tạo một đường cong chữ S nông, dẫn mắt từ trái sang phải.
- Bất đối xứng có kiểm soát; điểm nhấn nằm gần tỷ lệ một phần ba, không đặt giữa tuyệt đối.
- Có ba tầng chiều sâu: tiền cảnh tối nhẹ, trung cảnh đọc dữ liệu, hậu cảnh mờ và sáng hơn.

### 4.2. Màu và chất liệu

- Màu chính: xanh ngọc xám, lam khói, nâu mực và vàng khoáng nhạt.
- Tránh xanh dương bão hòa, neon hoặc tương phản lạnh quá mạnh vì sẽ làm mất sáu màu cá.
- Chất liệu là minh họa khoáng sắc pha màu nước, có nét cọ và hạt sắc tố tinh tế.
- Ánh sáng xiên từ phía trên, đủ cho cảm giác dưới nước nhưng không tạo các mảng sáng che cá.
- Bọt nước và hạt lơ lửng tập trung ở hai mép; vùng trung tâm ít chi tiết.

## 5. Cá dữ liệu

- Thân cá chép bầu, tròn và hơi béo; đầu nhỏ hơn thân một chút.
- Nhìn rõ đuôi chẻ, vây lưng, vây ngực, đường mang và mắt nhỏ.
- Thân cong nhẹ hình chữ S; đuôi quẫy về sau; vây ép theo dòng để thể hiện tốc độ.
- Tư thế nghiêng ngang ba phần tư rất nhẹ, không dùng dáng nhìn từ trên xuống.
- Biểu cảm quyết tâm nhưng vẫn ngộ nghĩnh; không nhân hóa bằng tay, chân hoặc phụ kiện.
- Chất liệu cá đồng nhất với tranh nền, viền mềm cùng màu và không có bóng sticker.
- Bộ tham chiếu gồm ba nhịp bơi: quẫy lên, thân thẳng tăng tốc và quẫy xuống.

## 6. Mã hóa dữ liệu

- Vị trí ngang của cá vẫn chỉ do hạn VMP quyết định.
- Vị trí dọc dùng các luồng chống chồng lấn và không mang ý nghĩa nghiệp vụ.
- Toàn thân cá mang một trong sáu màu tiến độ: xám mực, lam chàm, lục ngọc, tím khói, hoàng thổ và chu sa.
- Chu sa ghi đè màu tiến độ khi quá hạn; thẻ chi tiết giữ giai đoạn thực tế trước khi quá hạn.
- Sắp hạn có một vệt nước vàng nhạt; quá hạn có vệt nước đỏ trầm. Không thêm cờ, số áo hoặc huy chương lên thân cá.

## 7. Tín hiệu “cuộc đua”

- Dải nước sau đuôi, bọt khí kéo dài và tư thế thân tạo cảm giác vận tốc.
- Dòng nước nền ngược hướng cá để diễn tả nỗ lực.
- Các checkpoint nghiệp vụ không vẽ thành cổng trên nền; chúng được thể hiện bằng màu cá và thẻ chi tiết để tránh xung đột với trục deadline.
- Cá được chọn tăng nhẹ kích thước và có một vệt sáng ngắn; không đổi phong cách hay tách khỏi tranh.

## 8. Prompt tạo tranh

### 8.1. Nền

```text
Use case: stylized-concept
Asset type: wide website timeline background
Primary request: an elegant underwater koi racecourse suggesting a determined journey against time
Scene/backdrop: side-view underwater river corridor, powerful current flowing from right to left, a subtle luminous passage near the right third as the distant goal, asymmetrical dark rocks and sparse aquatic plants framing only the edges
Subject: flowing water and refined aquascape environment; no fish
Style/medium: painterly East Asian mineral-pigment and watercolor illustration, contemporary editorial polish, subtle natural pigment grain
Composition/framing: very wide cinematic composition, shallow S-curve guiding the eye from left to right, three depth layers, open quiet central band reserved for interactive data markers
Lighting/mood: soft angled underwater light, purposeful and energetic, sophisticated rather than aggressive
Color palette: muted jade-gray, smoky blue, warm ink brown, restrained pale mineral gold
Constraints: preserve generous negative space; no text; no labels; no logos; no watermark; no decorative gate; no symmetrical sports lanes
Avoid: neon blue, photorealistic aquarium photography, dense plants in the center, fantasy palace, surface-view camera, top-down view, existing fish
```

### 8.2. Bộ cá

```text
Use case: stylized-concept
Asset type: consistent character reference sheet for timeline markers
Primary request: three matching poses of one chubby round koi carp actively swimming to the right against a strong current
Subject: recognizable carp anatomy, plump oval body, small head, forked tail, visible dorsal and pectoral fins, subtle barbels, small determined eye; pose 1 tail sweeps upward, pose 2 body straightens to accelerate, pose 3 tail sweeps downward
Style/medium: simplified painterly East Asian mineral-pigment illustration, clean readable silhouette, refined and slightly playful
Composition/framing: three isolated side-view fish, evenly spaced, all fully visible with generous padding
Color palette: neutral pearl-gray body suitable for later six-state tinting, dark ink details, soft warm highlights
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal
Constraints: one consistent character across all poses; flat uniform background; no shadows; no reflections; no text; no watermark; do not use #00ff00 on the fish
Avoid: top-down koi, emoji face, human limbs, armor, clothing, oversized eyes, sticker outline, multiple species, extra fish
```

## 9. Kiểm tra và nghiệm thu

- Tranh nền phải đọc rõ ở tỷ lệ rộng của timeline và không chứa chữ hoặc cá dữ liệu.
- Vùng trung tâm phải đủ yên để sáu màu cá phân biệt được.
- Cá phải nhìn rõ là cá chép dù thu nhỏ còn khoảng 44–56 px.
- Ba tư thế phải cùng một nhân vật và cùng chất liệu.
- Chạy kiểm tra tĩnh cho sáu trạng thái, vị trí deadline và số lượng thiết bị minh họa.
- Kiểm tra HTTP và xác nhận prototype xuất hiện trong đúng tab Chrome Visual Companion hiện có.

## 10. Nguồn tham chiếu

- The Metropolitan Museum of Art, *Koi* của Keisai Eisen: https://www.metmuseum.org/art/collection/search/36696
- National Museum of Asian Art, *Carp* của Maruyama Ōkyo: https://investigatingedo.asia.si.edu/art/carp-okyo/
- International Aquatic Plants Layout Contest, Grand Prize Works: https://iaplc.com/e/grand_prize_works/
- Adobe Firefly, hướng dẫn viết prompt: https://helpx.adobe.com/firefly/web/work-with-images/generate-images/writing-effective-text-prompts.html
- Adobe Firefly, dùng ảnh tham chiếu bố cục: https://helpx.adobe.com/firefly/web/work-with-images/generate-images/match-image-composition-to-reference-image.html
