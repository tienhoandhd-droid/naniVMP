# VMP Long Môn Adaptive Team Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở rộng chiều cao Ngư đồ Cả nhóm theo mật độ để mọi cá có vị trí hợp lệ và không chồng lấn.

**Architecture:** Model trả thêm `sceneHeightPx` và bộ bố trí nhóm tính chiều cao tối thiểu từ số hàng va chạm thay vì bỏ toàn bộ vị trí khi vượt 520px. Component truyền chiều cao qua CSS custom property; cá nhân giữ scene gọn 520px, còn nhóm tăng chiều cao và để trang cuộn tự nhiên.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner, Puppeteer E2E.

## Global Constraints

- Giữ trục thời gian ba tháng, sáu trạng thái cá và quyền Cả nhóm/Cá nhân hiện tại.
- Không thu nhỏ cá để che mật độ, không gom cụm, không thêm animation.
- Chỉ kiểm thử unit Long Môn, typecheck, build và một E2E Long Môn.
- Không tác động dịch vụ remote, deploy hoặc push Git.

---

### Task 1: Model chiều cao thích ứng

**Files:**
- Modify: `tests/unit/long-mon-race.test.mjs`
- Modify: `src/features/monitoring/longMonRaceModel.ts`

**Interfaces:**
- Produces: `LongMonRaceModel.sceneHeightPx: number`.
- Produces: bố trí nhóm có đầy đủ vị trí cho 20, 30 và 40 cá cùng tuần.

- [ ] **Step 1: Viết kiểm thử đỏ**

Thêm fixture 40 cá cùng tuần; kiểm tra `sceneHeightPx > 520`, không có cá ở đồng thời `xPct === 0 && yPct === 0`, và không có cặp va chạm khi dùng chính `sceneHeightPx`.

- [ ] **Step 2: Chạy kiểm thử và xác nhận RED**

Run: `node --test --import tsx tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì `sceneHeightPx` chưa tồn tại hoặc đàn 40 cá còn chồng.

- [ ] **Step 3: Sửa model tối thiểu**

Cho thuật toán interval-coloring trả cả số hàng. Tính chiều cao nhóm bằng `Math.max(520, rowCount * collisionHeight + (rowCount - 1) * 8)`, dùng chiều cao này khi đặt `yPx/yPct`, và không trả `Map` rỗng do thiếu chiều cao. Cá nhân vẫn đặt trong 520px.

- [ ] **Step 4: Chạy unit và typecheck**

Run: `node --test --import tsx tests/unit/long-mon-race.test.mjs tests/unit/long-mon-race-scope.test.mjs`

Run: `npx tsc --noEmit`

Expected: 0 fail và exit 0.

### Task 2: Nối chiều cao vào scene và xác minh local

**Files:**
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Modify: `src/features/monitoring/long-mon-race.css`
- Modify: `tests/e2e/long-mon-race.mjs`

**Interfaces:**
- Consumes: `LongMonRaceModel.sceneHeightPx`.
- Produces: `--long-mon-scene-height` và `data-scene-height` trên canvas.

- [ ] **Step 1: Viết kiểm thử component đỏ**

Trong unit markup/source, yêu cầu canvas xuất `data-scene-height` và CSS custom property; scene cá nhân vẫn có giá trị 520.

- [ ] **Step 2: Chạy kiểm thử và xác nhận RED**

Run: `node --test --import tsx tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì component chưa truyền chiều cao model.

- [ ] **Step 3: Sửa component và CSS tối thiểu**

Thêm `--long-mon-scene-height: ${model.sceneHeightPx}px`; CSS dùng chiều cao lớn hơn giữa scene responsive tối thiểu và custom property, không bật `overflow-y` nội bộ.

- [ ] **Step 4: Cập nhật E2E và xác minh**

E2E kiểm tra `data-scene-height` khớp chiều cao canvas trong sai số CSS, cá không chồng ở desktop/mobile và scope cá nhân vẫn gọn.

Run: build Vite với env tạm, sau đó `VMP_E2E_URL=http://127.0.0.1:<temporary-port>/ node tests/e2e/long-mon-race.mjs`.

Expected: exit 0; ảnh desktop/mobile không có cá chồng.

- [ ] **Step 5: Commit đúng file liên quan**

```text
git add src/features/monitoring/longMonRaceModel.ts src/features/monitoring/LongMonRace.tsx src/features/monitoring/long-mon-race.css tests/unit/long-mon-race.test.mjs tests/e2e/long-mon-race.mjs
git commit -m "fix(monitoring): expand dense team fish scene"
```
