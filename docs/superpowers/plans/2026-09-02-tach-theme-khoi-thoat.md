# Tách nút giao diện khỏi Thoát Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đặt nút đổi giao diện vào một hàng tùy chọn riêng phía trên thẻ tài khoản để loại bỏ nguy cơ bấm nhầm với `Thoát`.

**Architecture:** Giữ nguyên `ThemeToggle`, state và cơ chế lưu theme. Chỉ đổi cấu trúc desktop của `Sidebar`; mobile drawer và các hành động tài khoản không đổi. Unit test kiểm tra ranh giới DOM, E2E kiểm tra vị trí thực và hành vi trên Chrome.

**Tech Stack:** React, TypeScript, inline Lotus Pearl tokens, Node test runner, Puppeteer.

## Global Constraints

- Không thay đổi quyền, dữ liệu, API, RPC hoặc cách lưu theme.
- Desktop có đúng một nút theme trong hàng `Giao diện` riêng phía trên thẻ tài khoản.
- Nút theme không nằm trong thẻ chứa hành động `Thoát`.
- Mobile drawer giữ nguyên vị trí theme hiện có.

---

### Task 1: Tách tùy chọn giao diện khỏi hành động tài khoản

**Files:**
- Modify: `src/components/layout/Layout.tsx`
- Modify: `tests/unit/topbar-controls.test.mjs`
- Modify: `tests/e2e/theme-person-layout.mjs`

**Interfaces:**
- Consumes: `ThemeToggle({ compact: true })`, `.vmp-sidebar-account__identity` và accessible name `Giao diện …` hiện có.
- Produces: `.vmp-sidebar-preferences` chứa nhãn `Giao diện` cùng đúng một `ThemeToggle`; thẻ `.vmp-sidebar-account__identity` chỉ chứa nhận diện, `Mật khẩu` và `Thoát`.

- [ ] **Step 1: Viết test thất bại cho ranh giới an toàn**

Sửa unit test để render `Sidebar` thật, xác nhận `.vmp-sidebar-preferences` đứng trước `.vmp-sidebar-account__identity`, nút theme thuộc hàng tùy chọn và không thuộc thẻ tài khoản. Sửa E2E để kiểm tra nút theme nằm hoàn toàn trong rect hàng tùy chọn, hàng tùy chọn nằm phía trên thẻ tài khoản với khoảng cách ít nhất `8px`, và thẻ tài khoản không chứa nút theme.

- [ ] **Step 2: Chạy RED**

```powershell
node --import tsx --test tests/unit/topbar-controls.test.mjs
```

Expected: FAIL vì chưa có `.vmp-sidebar-preferences` và nút theme vẫn nằm trong `.vmp-sidebar-account__identity`.

- [ ] **Step 3: Cài đặt tối thiểu**

Trong `Sidebar`, khi không thu gọn, render trước thẻ tài khoản:

```tsx
<div className="vmp-sidebar-preferences" role="group" aria-label="Tùy chọn giao diện">
  <span>Giao diện</span>
  <ThemeToggle compact />
</div>
```

Hàng dùng token màu hiện có, `display: flex`, căn hai đầu, vùng bấm theme tối thiểu `32×32px` và `marginTop`/`marginBottom` tạo khoảng cách rõ. Xóa `.vmp-sidebar-theme` khỏi hàng nút tài khoản; giữ `Mật khẩu` và `Thoát` cân đều.

- [ ] **Step 4: Chạy GREEN và kiểm tra hành vi Chrome**

```powershell
node --import tsx --test tests/unit/topbar-controls.test.mjs
$env:VMP_E2E_URL='http://127.0.0.1:4175/'; node tests/e2e/theme-person-layout.mjs
```

Expected: unit và E2E exit `0`; theme vẫn chuyển trạng thái, hàng tùy chọn cách thẻ tài khoản ít nhất `8px`.

- [ ] **Step 5: Chạy gate hẹp và commit**

```powershell
npm run typecheck
npm run drift
$env:VITE_MANUAL_PLANNED_DEADLINES_ENABLED='true'; npm run build
git diff --check
```

Expected: tất cả exit `0`; build chỉ còn cảnh báo font/dynamic-import đã biết. Kiểm tra trực quan desktop, sau đó commit đúng ba file implementation/test và cập nhật bằng chứng trong plan.
