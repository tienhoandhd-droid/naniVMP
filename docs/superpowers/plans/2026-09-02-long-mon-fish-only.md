# Long Môn Fish-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ mã chữ trên thân cá mà giữ nguyên khả năng hiểu và thao tác.

**Architecture:** Chỉ thay markup trình bày trong `LongMonRace`; accessible name và tooltip tiếp tục cung cấp thông tin theo yêu cầu. Không đổi model hoặc CSS bố trí.

**Tech Stack:** React 18, TypeScript, Node test runner, Vite.

## Global Constraints

- Giữ nút cá semantic, keyboard focus và `aria-label`.
- Giữ tooltip, chi tiết khi bấm, mốc thời gian và chú giải.
- Không thay dữ liệu, quyền hoặc API.

---

### Task 1: Bỏ mã chữ khỏi thân cá

**Files:**
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Test: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: `LongMonRaceFish` và metadata stage hiện có.
- Produces: nút cá chỉ có sprite/wake trong thân, vẫn có tooltip và accessible name.

- [x] Viết assertion RED: SSR không được có `long-mon-race__code`, nhưng vẫn có `aria-label` và tooltip.
- [x] Chạy unit mục tiêu và xác nhận RED do mã chữ còn tồn tại.
- [x] Xóa đúng span mã chữ trong thân cá.
- [x] Chạy unit Long Môn, typecheck và build.
- [x] Kiểm preview `4175`, commit local; không push/deploy.

## Bằng chứng

- Unit Long Môn: `25/25` đạt; typecheck và build exit `0`.
- Ảnh desktop `long-mon-race-1440.png` xác nhận thân cá không còn thẻ mã.
- E2E ảnh dừng ở assertion mobile có sẵn: `TB-108-PV` và `TB-109-GSP` bị
  `getBoundingClientRect()` đo dưới `44px` sau scale; không liên quan markup chữ.
