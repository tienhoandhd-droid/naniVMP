# Sắp xếp theme và phạm vi nhân sự Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa nút giao diện về thẻ tài khoản và cân thanh phạm vi bằng capsule chọn nhân sự căn phải.

**Architecture:** Giữ nguyên state và handler hiện có. Chỉ đổi cây DOM của `Sidebar`/`Topbar`/`GlobalFilterBar`, thêm class trình bày trong CSS của Overview và bảo vệ vị trí, responsive, accessible name bằng unit cùng E2E browser thật.

**Tech Stack:** React 19, TypeScript, CSS token Lotus Pearl, Node test runner, Puppeteer mock Supabase.

## Global Constraints

- Không thay đổi quyền, dữ liệu, API, RPC hoặc cách lưu theme.
- Desktop có đúng một nút theme trong thẻ tài khoản; mobile giữ nút trong drawer.
- Bộ chọn nhân sự giữ `aria-label="Chọn nhân sự xem tiến độ"` và hành vi chọn hiện có.
- Chỉ sửa đúng bề mặt UI liên quan; không mở rộng mobile ngoài việc chống tràn.

---

### Task 1: Di chuyển hai control và bảo vệ bố cục

**Files:**
- Modify: `src/components/layout/Layout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/overview/overview-executive.css`
- Modify: `tests/unit/topbar-controls.test.mjs`
- Create: `tests/e2e/theme-person-layout.mjs`

**Interfaces:**
- Consumes: `ThemeToggle()`, `GlobalFilterBar` props và `aria-label="Chọn nhân sự xem tiến độ"` hiện có.
- Produces: `.vmp-sidebar-account__identity`, `.vmp-sidebar-theme`, `.vmp-global-filter__left`, `.vmp-global-filter__person`.

- [x] **Step 1: Viết unit test thất bại cho vị trí theme** — `a32655b`

Render `Topbar` và `Sidebar` thật bằng `renderToStaticMarkup`; kiểm `Topbar` không còn accessible name giao diện, còn `.vmp-sidebar-account__identity` chứa đúng một nút có `aria-label="Giao diện Theo hệ thống…"`.

- [x] **Step 2: Viết E2E thất bại cho hình học và hành vi** — `a32655b`

Mở Overview qua mock hiện có; ở 1440×900 kiểm tâm capsule nhân sự nằm bên phải nút `Bộ lọc`, theme nằm trong rect thẻ tài khoản, select đổi được người và theme chuyển trạng thái. Ở 640×900 kiểm `scrollWidth <= clientWidth` và select cao tối thiểu 44px.

- [x] **Step 3: Chạy RED** — `a32655b`

```powershell
node --import tsx --test tests/unit/topbar-controls.test.mjs
$env:VMP_E2E_URL='http://127.0.0.1:4175/'; node tests/e2e/theme-person-layout.mjs
```

Expected: unit fail vì theme còn trong Topbar; E2E fail vì capsule nhân sự chưa căn phải và theme chưa nằm trong thẻ tài khoản.

- [x] **Step 4: Cài đặt tối thiểu** — `a32655b`

Trong `Sidebar`, bọc hàng avatar/tên bằng `.vmp-sidebar-account__identity` và render `<ThemeToggle />` ở cuối hàng; khi collapsed không render theme. Xóa `<ThemeToggle />` khỏi `Topbar`; giữ bản trong `MobileDrawer`.

Trong `GlobalFilterBar`, bọc scope + popover bằng:

```tsx
<div className="vmp-global-filter__left">
  <span className="vmp-global-filter__scope">…</span>
  <div className="vmp-global-filter__popover">…</div>
</div>
{personControl}
```

Đổi copy nhãn thành `Tiến độ của`. CSS dùng `justify-content: space-between`, capsule nền `var(--lp-bg-raised)`, viền `var(--lp-gold-hairline)`, bo tròn `999px`; select nền trong suốt. Ở `max-width: 640px`, hai cụm rộng 100%, select `min-height: 44px` và không tràn.

- [x] **Step 5: Chạy GREEN và gate phát hành hẹp** — `a32655b`

```powershell
node --import tsx --test tests/unit/topbar-controls.test.mjs
$env:VMP_E2E_URL='http://127.0.0.1:4175/'; node tests/e2e/theme-person-layout.mjs
npm run typecheck
$env:VITE_MANUAL_PLANNED_DEADLINES_ENABLED='true'; npm run build
```

Expected: tất cả exit `0`; build chỉ còn cảnh báo font/dynamic-import đã biết.

- [x] **Step 6: Kiểm tra trực quan và commit** — `a32655b`

Chụp 1440×900 và 640×900, xác nhận hierarchy cân hai đầu, focus ring rõ và không có control trùng. Xóa ảnh tạm, cập nhật bằng chứng vào plan, rồi commit riêng các file của Task 1.

## Bằng chứng hoàn thành

- Unit `topbar-controls`: 4/4 đạt.
- E2E `theme-person-layout`: 7/7 đạt ở desktop và màn hẹp.
- `typecheck`, `drift`, `build`: exit 0; build chỉ còn cảnh báo font và dynamic-import đã biết.
- Đã kiểm tra trực quan 1440×900 và 640×900; ảnh tạm đã xóa.
