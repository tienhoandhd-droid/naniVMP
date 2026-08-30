# Vòng năm Original Refined Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khôi phục biểu đồ cánh dữ liệu động của Vòng năm, nâng bảng màu và bảo đảm toàn bộ nhãn tháng nằm ngoài vòng.

**Architecture:** `VongNam.tsx` tiếp tục sở hữu phép gom dữ liệu và SVG; helper `dungDongHoNam` bổ sung tỷ lệ khối lượng đã chuẩn hóa để phép tính hình học có thể kiểm thử. `src/index.css` chỉ đảm nhiệm vật liệu thị giác, tỉ lệ responsive và kiểu chữ. Không thêm dependency hoặc asset runtime.

**Tech Stack:** React 18, TypeScript, SVG, CSS container queries, Node test, Puppeteer E2E.

## Global Constraints

- Chỉ sửa `VongNam.tsx`, CSS Vòng năm trong `src/index.css` và các test trực tiếp liên quan.
- Không dùng `git reset`, `git checkout`, `git restore`; không hoàn tác thay đổi ngoài phạm vi.
- Không commit hoặc push; mọi thay đổi giữ ở local.
- Không thêm dependency, canvas, WebGL hoặc ảnh raster cho biểu đồ.

---

### Task 1: Phép chuẩn hóa cánh dữ liệu

**Files:**
- Modify: `src/components/dashboard/VongNam.tsx`
- Test: `tests/unit/vong-nam-calendar.test.mjs`

**Interfaces:**
- Consumes: `OThangNam[]` từ `dungVongNam`.
- Produces: `dungDongHoNam(o): DongHoThangNam[]`, trong đó mỗi phần tử có `tiLeKhoiLuong` thuộc `[0, 1]` và `tiLeXong` thuộc `[0, 1]`.

- [ ] **Step 1: Viết test đỏ cho tỷ lệ khối lượng**

Thêm trường hợp các tháng có `tong` lần lượt `2`, `8`, `0`; kỳ vọng `tiLeKhoiLuong` là `0.25`, `1`, `0`, đồng thời thay `8` thành `4` phải làm tháng đầu thành `0.5`.

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `node --import tsx --test tests/unit/vong-nam-calendar.test.mjs`

Expected: FAIL vì `tiLeKhoiLuong` chưa tồn tại.

- [ ] **Step 3: Bổ sung chuẩn hóa trong helper**

Tính `caoNhat = Math.max(1, ...months.map(x => Math.max(0, x.tong)))`; trả `tiLeKhoiLuong = Math.max(0, x.tong) / caoNhat` cho đủ 12 tháng. Giữ nguyên `tong` gốc để không đổi dữ liệu hiển thị.

- [ ] **Step 4: Chạy targeted unit**

Run: `node --import tsx --test tests/unit/vong-nam-calendar.test.mjs`

Expected: PASS.

### Task 2: SVG bản gốc tinh chỉnh và chữ không chèn vòng

**Files:**
- Modify: `src/components/dashboard/VongNam.tsx`
- Modify: `src/index.css`
- Test: `tests/e2e/overview-executive-dashboard.mjs`

**Interfaces:**
- Consumes: `DongHoThangNam.tiLeKhoiLuong`, `tiLeXong`, `trangThai`.
- Produces: 12 `[data-vongnam-track]`, các `[data-vongnam-bar]` cho tháng có dữ liệu, 12 `[data-vongnam-label]`, một `[data-vongnam-today]` khi xem năm hiện tại.

- [ ] **Step 1: Sửa E2E thành hợp đồng mới**

Khẳng định có 12 track, 12 label, không có `[data-vongnam-petal]`, mọi label có `data-radius` lớn hơn `data-max-radius` của SVG ít nhất 16, và nút bảng số vẫn mở đủ 12 dòng.

- [ ] **Step 2: Chạy targeted E2E để xác nhận thất bại**

Run: `node tests/e2e/overview-executive-dashboard.mjs`

Expected: FAIL vì DOM hiện tại còn cánh sen và chưa có track/label contract.

- [ ] **Step 3: Khôi phục hình học cánh động**

Dùng quạt vành khuyên với bán kính trong cố định và bán kính ngoài `R0 + tiLeKhoiLuong * (RMAX - R0)`. Vẽ phần hoàn thành ở trong, phần còn lại ở ngoài; thêm nắp đỏ son cho quá hạn và viền vàng cho tháng hiện tại. Xóa hào quang sen, vòng cung mảnh và 60 vạch đồng hồ.

- [ ] **Step 4: Tách nhãn khỏi vòng**

Đặt 12 nhóm nhãn ở `R_NHAN >= RMAX + 16`, dùng hai dòng `Tn`/số. Chỉ tháng hiện tại có huy hiệu. Kim hôm nay bắt đầu tại `R0 + 6`, kết thúc không quá `RMAX + 2`, không đi qua lõi.

- [ ] **Step 5: Tinh chỉnh CSS**

Dùng nền vỏ trứng, họ mận sơn, đỏ son, vàng cổ và xanh xà cừ; đặt vòng desktop tối đa 390–410px, lõi 30%, nhãn tối thiểu 12px; giữ container query xếp dọc ở thẻ hẹp.

- [ ] **Step 6: Chạy targeted E2E**

Run: `node tests/e2e/overview-executive-dashboard.mjs`

Expected: PASS.

### Task 3: Cổng kiểm tra bàn giao

**Files:**
- Verify only; không mở rộng phạm vi.

- [ ] **Step 1: Chạy typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 2: Chạy build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Chụp màn hình Overview desktop và kiểm tra trực quan**

Chụp ở `1440x900`; xác nhận 12 nhãn không chạm cánh, chữ trung tâm không chạm vành, kim không cắt qua chữ, cột báo cáo không lấn biểu đồ.

