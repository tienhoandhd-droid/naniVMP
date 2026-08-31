# Soi toàn web — UX · UI · tốc độ · hiệu năng (desktop-first)

31/08/2026 · đo trên bản build production local (mock Supabase, viewport 1920×1080, `scripts/do-hieu-nang.mjs` — chạy lại được bất cứ lúc nào).

## 1 · Số đo tám màn (TRƯỚC đợt nâng cấp)

| Màn | DCL | Tải cache lạnh | DOM nodes | Ghi chú |
|---|---:|---:|---:|---|
| Việc hôm nay | 121ms | 700KB | 1010 | webp chibi + JS lõi — ổn |
| **Dòng thời gian** | 65ms | **3.764KB** | 511 | 3.74MB là tranh PNG |
| Tổng quan | 67ms | 68KB | 1158 | rất tốt |
| Tiến độ | 72ms | 62KB | 1275 | rất tốt |
| Phân công | 69ms | 14KB | 627 | tốt nhất app |
| **Báo cáo** | 63ms | **243KB** | 1069 | 227KB là three.js chưa ai cần |
| Cảnh báo | 65ms | 18KB | 689 | rất tốt |
| Dữ liệu nguồn | 62ms | 49KB | 469 | rất tốt |

Kết luận nền tảng: **kiến trúc tách chunk của app vốn đã tốt** (mọi màn DCL < 125ms, exceljs/3D đã lazy phần lớn). Chỉ có đúng hai điểm nghẽn, cả hai đã xử trong đợt này.

## 2 · Đã nâng cấp (commit `75aa134`)

### 2a. Tranh Ngư đồ PNG → WebP — Dòng thời gian nhẹ 88%
`3.764KB → 440KB`. Racecourse 2633→221KB · atlas sáu loài 860→149KB · cổng Vũ Môn 250→50KB (q=.82, mắt thường không phân biệt — đã soi ảnh). PNG gốc giữ làm nguồn; tranh mới sau này nén bằng `scripts/nen-art-webp.mjs`.

### 2b. Báo cáo thôi kéo three.js — nhẹ 95% khi mở màn
`243KB → 11KB`. `VmpSpace3D` tách đôi: vỏ 2D + toggle mount ngay (4.7KB); `VmpSpace3DCanvas` + chunk three (~231KB gzip) chỉ tải khi bấm "Xem bản đồ 3D". Màu giai đoạn qua holder chung (`vmpSpace3dShared.ts`) nên đổi theme ăn cả hai nửa.

### 2c. Dứt điểm lớp lỗi trắng màn (commit `d020e0e`, cùng ngày)
Ba tầng: thang chiều cao hồ 560→2240px → xếp lưới khẩn cấp không bao giờ ném (thử 600 cá) → `LongMonRaceGuard` đỡ mọi lỗi render còn lại bằng danh sách hạn bấm được. Sự cố 126 cá production có test hồi quy riêng.

### 2d. Nghệ thuật Ngư đồ — hết "bức tường tên thiết bị"
Đàn > 24 cá: giấu thẻ bài đại trà, chỉ **cá quá hạn** (việc phải xử) + cá đang rê/focus mang thẻ. Đàn thưa hiện đủ như cũ. Tooltip đầy đủ vẫn còn khi rê.

## 3 · Còn mở — đề xuất đợt sau, theo thứ tự đáng tiền

1. **Cache-first cho khách quen** (giá trị cao nhất còn lại): tài nguyên đã có hash trong tên — thêm `Cache-Control` dài hạn không khả thi trên GitHub Pages (max-age=600 cố định), nhưng có thể thêm `<link rel="preload">` cho 3 tranh webp ở TimelinePage và prefetch chunk màn kế bên khi rảnh (`requestIdleCallback`).
2. **`index.css` 7.593 dòng nạp toàn cục** (~grep thấy 178 hex + phần Gantt cũ đã chết): sau khi workbench Gantt bị bỏ, ~2.000 dòng `.timeline-*` trong index.css là CSS mồ côi — xoá được là giảm parse + bớt drift. Cần rà kỹ selector nào còn ai dùng trước khi cắt.
3. **`vali-chibi` còn 2 file 75–79KB** sát trần ngân sách 80KB — nếu vẽ thêm mood mới, nén ngay bằng `scripts/nen-chibi-webp.mjs`.
4. **A11y nợ moderate** (axe in ra nhưng chưa chặn): siết sau khi giữ sạch serious một thời gian.
5. **Ảnh chuẩn visual**: baseline Linux đã lệch thiết kế mới — chạy workflow `visual-baseline` trên GitHub để niêm phong lại (việc bấm nút của chủ dự án).
6. **Windows dev-loop**: `with-preview.sh` vẫn kẹt ACL `mv dist` trên máy này; local đang đi vòng build + `vite preview` tay. Nếu muốn sửa tận gốc: đổi script sang copy-then-swap thay vì rename.

## 4 · Điểm mạnh giữ nguyên
Lazy-route toàn bộ màn qua `nhapCoThuLai` (chống 404 chunk sau deploy) · exceljs chỉ nạp lúc xuất · font tự host woff2 tách subset vietnamese · mock e2e chặn mạng tuyệt đối · `CauKetLuan` trên biểu đồ.
