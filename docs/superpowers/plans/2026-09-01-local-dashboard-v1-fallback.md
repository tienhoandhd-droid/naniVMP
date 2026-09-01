# Local Dashboard V1 Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khôi phục khả năng tải dữ liệu trên local khi Supabase chưa có RPC dashboard v2.

**Architecture:** Adapter thử contract canonical v2 trước và chỉ lùi về read model v1 khi server xác nhận hàm v2 chưa tồn tại. Mọi lỗi khác giữ nguyên fail-closed.

**Tech Stack:** TypeScript, Supabase JS, Node test runner, Vite.

## Global Constraints

- Không ghi remote hoặc áp migration.
- Không fallback cho lỗi quyền, phiên, mạng hay payload.
- Giữ nguyên API `fetchVmpDataFromSupabase()`.

---

### Task 1: Fallback dashboard tương thích

**Files:**
- Modify: `src/lib/supabaseData.ts`
- Test: `tests/unit/canonical-dashboard-adapter.test.mjs`

**Interfaces:**
- Consumes: RPC v2/v1 có cùng tham số `p_year`, `p_include_missing`.
- Produces: `VmpDataset`; v2 có `statusSource="server"`, v1 có `statusSource="compatibility"`.

- [x] Viết test RED: v2 trả `PGRST202`, adapter gọi v1 và trả dữ liệu tương thích.
- [x] Chạy unit, xác nhận RED do adapter đang ném ngay lỗi v2.
- [x] Cài fallback tối thiểu và giữ `FORBIDDEN` không fallback.
- [x] Chạy unit, typecheck và build.
- [x] Kiểm preview `http://127.0.0.1:4175` trả HTTP 200 và commit local.

## Bằng chứng

- Unit adapter + contract + authorization: `11/11` đạt.
- Typecheck và build: exit `0`.
- Preview `4175`: HTTP `200`, trả đúng bundle mới `index-C1IqJQ2j.js`.
