# Overview Year and Vali Editorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cân lại bố cục Vòng năm và thay minh họa nhỏ trong báo cáo nhanh bằng bộ ảnh Vali web mới theo mood.

**Architecture:** Giữ nguyên phép tính và SVG của `VongNam`, chỉ chuyển `CauKetLuan` vào cột báo cáo và chỉnh CSS container. Tách phép chọn mood/nội dung Vali thành helper thuần để unit test; `PrincessCommentary` chỉ render bản tóm tắt và ảnh WebP tương ứng.

**Tech Stack:** React 18, TypeScript, CSS thuần, Node test runner, Puppeteer E2E, Vite.

## Global Constraints

- Chỉ sửa `VongNam` và `PrincessCommentary` trên trang Tổng quan cùng helper/test trực tiếp của chúng.
- Không đổi công thức số liệu, điều hướng, quyền truy cập, KPI hoặc màn hình khác.
- Vali hiển thị một kết luận và tối đa hai dữ kiện hỗ trợ.
- Không thay `ValiIllustration` toàn hệ thống.
- Không thêm dependency và không commit; mọi thay đổi ở local.

---

### Task 1: Helper báo cáo nhanh Vali

**Files:**
- Create: `src/features/overview/valiBrief.ts`
- Create: `tests/unit/overview-vali-brief.test.mjs`

**Interfaces:**
- Consumes: `{ rate, todo, overdue, soon, mismatched }` dạng số.
- Produces: `buildValiBrief(stats): { mood: "guide" | "concern" | "celebrate"; headline: string; facts: Array<{ tone: string; text: string }> }` với `facts.length <= 2`.

- [ ] **Step 1: Viết unit test thất bại**

Kiểm tra ba trường hợp: quá hạn chọn `concern`, kế hoạch sạch chọn `celebrate`, và mọi kết quả chỉ có tối đa hai facts theo thứ tự quá hạn → tới hạn → chưa hoàn tất → tiến độ.

- [ ] **Step 2: Chạy test để xác nhận RED**

Run: `node --import tsx --test tests/unit/overview-vali-brief.test.mjs`

Expected: FAIL vì `valiBrief.ts` chưa tồn tại.

- [ ] **Step 3: Viết helper tối thiểu**

Helper phải thuần, không đọc DOM/thời gian và không tạo số ngoài input. Headline ưu tiên quá hạn, sau đó tới hạn, tiến độ tốt, cuối cùng là nhắc bám kế hoạch.

- [ ] **Step 4: Chạy test để xác nhận GREEN**

Run: `node --import tsx --test tests/unit/overview-vali-brief.test.mjs`

Expected: PASS toàn bộ.

### Task 2: Bố cục biên tập cho Vòng năm

**Files:**
- Modify: `src/components/dashboard/VongNam.tsx`
- Modify: `src/index.css`
- Modify: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Consumes: props hiện có của `VongNam`, không đổi chữ ký.
- Produces: `.vmp-vongnam-ketluan` nằm trong `.vmp-vongnam-ben`; desktop hai cột, mobile một cột.

- [ ] **Step 1: Bổ sung E2E contract trước khi sửa JSX**

E2E phải xác nhận `.vmp-vongnam-ben .vmp-vongnam-ketluan` tồn tại, không có kết luận là con trực tiếp của `.vmp-vongnam`, và desktop vẫn có hai cột.

- [ ] **Step 2: Chạy targeted E2E để xác nhận RED**

Run: `$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'; $env:VMP_E2E_SUPABASE_URL='https://ivembmikfhtyzhtqebgh.supabase.co'; node tests/e2e/overview-executive-dashboard.mjs`

Expected: FAIL ở contract vị trí kết luận.

- [ ] **Step 3: Chuyển kết luận vào cột báo cáo và cân CSS**

Đặt `CauKetLuan` trước prop `ben` bên trong `.vmp-vongnam-ben`. Dùng cột khoảng 56/44, bỏ panel lồng dư thừa, giữ một nền báo cáo liền mạch và giảm khoảng trống theo chiều dọc.

- [ ] **Step 4: Chạy targeted E2E để xác nhận GREEN**

Expected: PASS contract SVG, bảng 12 tháng, layout desktop/mobile và vị trí kết luận.

### Task 3: PrincessCommentary dùng Vali web mới

**Files:**
- Modify: `src/components/ui/Primitives.tsx`
- Modify: `src/index.css`
- Modify: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Consumes: `buildValiBrief` và ba asset `vali-guide.webp`, `vali-concern.webp`, `vali-celebrate.webp`.
- Produces: `[data-vmp-vali-brief]`, `[data-vmp-vali-web=<mood>]` và tối đa hai `[data-vmp-vali-fact]`.

- [ ] **Step 1: Bổ sung E2E contract cho ảnh và độ ngắn**

Kiểm tra ảnh WebP đúng mood hiện tại được hiển thị, `ValiIllustration` không còn trong `PrincessCommentary`, facts không quá hai, ảnh có alt rỗng và nội dung không tràn ngang ở 390px.

- [ ] **Step 2: Chạy E2E để xác nhận RED**

Expected: FAIL vì selector Vali web chưa tồn tại.

- [ ] **Step 3: Thay JSX inline bằng cấu trúc class có ngữ nghĩa**

Render tiêu đề, headline và facts từ helper. Dùng `<img alt="" aria-hidden="true">`, neo đáy bên phải; nội dung đứng trước ảnh trong DOM. Không thêm nút hoặc lời chào dài.

- [ ] **Step 4: Thêm CSS responsive và reduced-motion**

Desktop dùng vùng nội dung rộng và chân dung lớn; mobile giảm ảnh, không để ảnh che chữ. Dùng token nền/viền hiện có, không animation lặp.

- [ ] **Step 5: Chạy unit và E2E để xác nhận GREEN**

Run:

```powershell
node --import tsx --test tests/unit/overview-vali-brief.test.mjs tests/unit/vong-nam-calendar.test.mjs
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:VMP_E2E_SUPABASE_URL='https://ivembmikfhtyzhtqebgh.supabase.co'
node tests/e2e/overview-executive-dashboard.mjs
```

Expected: unit và Overview E2E đều PASS.

### Task 4: Xác minh và ảnh duyệt

**Files:**
- Verify only; không tạo artifact trong repository.

- [ ] **Step 1: Chạy typecheck**

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 2: Chạy production build**

Run `npm run build`; nếu PowerShell tiếp tục chặn `.env` với `EPERM`, chạy Vite programmatic build với `envDir` và `outDir` tạm sạch như gate bàn giao đã dùng.

Expected: 2316 hoặc nhiều hơn modules transformed, exit 0.

- [ ] **Step 3: Kiểm tra diff và chụp hai component**

Run: `git diff --check` và Puppeteer screenshot `.b-hero`, `.b-vali` vào thư mục temp.

Expected: diff check sạch, ảnh desktop không chồng chữ và ảnh mobile không tràn ngang.
