# Today Botanical QA Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng danh sách “Việc hôm nay” thành Botanical QA Ledger và chỉ hiển thị người QA phụ trách trong hàng tóm tắt.

**Architecture:** Giữ nguyên model `TodayActionRow`, phân nhóm, quyền và callback. Thay đổi chỉ nằm ở markup tóm tắt của `TodayQueueRow`/header `TodayQueueSection` và lớp trình bày `.hn-*`; phòng ban tiếp tục được render trong `TodayRowDetails`.

**Tech Stack:** React 19, TypeScript, CSS token Lotus, Node test runner, Puppeteer E2E, Vite.

## Global Constraints

- Chỉ màn “Việc hôm nay” bỏ bộ phận khỏi bảng/thẻ tóm tắt; các màn khác giữ nguyên.
- Cột desktop giữ thứ tự: Mã, Hạng mục, Mốc, QA phụ trách, Trễ, Thao tác.
- `row.department` vẫn xuất hiện trong `TodayRowDetails`.
- Không đổi model dữ liệu, thuật toán ưu tiên, phân quyền, deep-link hoặc callback cập nhật.
- Không sửa `CatalogWorkspaceShell` hay `catalog-workspace.css` trong đợt này.
- Giữ nguyên mọi thay đổi đang có trong worktree; không dùng reset/checkout/restore và không commit nếu người dùng chưa yêu cầu.
- Mobile 390×844 không tràn ngang; nút thao tác cao tối thiểu 44px.

---

## File Structure

- Modify: `src/features/today/TodayCommandCenter.tsx` — đổi nhãn cột và bỏ phòng ban khỏi hàng tóm tắt.
- Modify: `src/features/today/today.css` — Botanical QA Ledger, responsive và focus state.
- Modify: `tests/unit/today-command-center.test.mjs` — khóa cấu trúc QA phụ trách/phòng ban chi tiết.
- Create: `tests/e2e/today-qa-ledger.mjs` — kiểm tra desktop, mobile và luồng mở đúng hạng mục.

### Task 1: Regression tests cho nội dung và hành vi QA Ledger

**Files:**
- Modify: `tests/unit/today-command-center.test.mjs`
- Create: `tests/e2e/today-qa-ledger.mjs`

**Interfaces:**
- Consumes: `TodayCommandCenterContent`, `.hn-nhom--overdue`, `.hn-cot`, `.hn-muc__nguoi`, `.hn-muc__mo--inline`, `.hn-muc__nut`.
- Produces: Regression contract cho nhãn `QA phụ trách`, tóm tắt không có phòng ban, chi tiết vẫn có `Phòng ban`.

- [ ] **Step 1: Thêm assertions unit vào test render hiện có**

Trong test `Today content presents four queues...`, thêm:

```js
assert.match(html, /QA phụ trách/);
assert.doesNotMatch(html, /Phụ trách · Bộ phận/);
assert.match(html, /class="hn-muc__nguoi"><b>Chưa phân công QA<\/b><\/span>/);
const ownerCells = html.match(/<span class="hn-muc__nguoi">[\s\S]*?<\/span>/g) ?? [];
assert.ok(ownerCells.length > 0);
ownerCells.forEach((cell) => assert.doesNotMatch(cell, /<i>/));
assert.match(html, /<dt>Phòng ban<\/dt><dd>QA<\/dd>/);
```

- [ ] **Step 2: Chạy unit để xác nhận đỏ**

Run:

```powershell
node --import tsx --test tests/unit/today-command-center.test.mjs
```

Expected: FAIL vì header còn `Phụ trách · Bộ phận` và `.hn-muc__nguoi` còn thẻ `<i>` phòng ban.

- [ ] **Step 3: Tạo E2E desktop/mobile bằng Supabase giả lập**

Tạo `tests/e2e/today-qa-ledger.mjs` theo bootstrap của `today-vali-expressions.mjs`, sau khi mở `#v=today` kiểm tra:

```js
const desktop = await page.$eval(".hn-nhom--overdue", (section) => {
  const firstRow = section.querySelector(".hn-muc");
  const trigger = firstRow?.querySelector(".hn-muc__mo--inline");
  const owner = firstRow?.querySelector(".hn-muc__nguoi");
  return {
    headers: [...section.querySelectorAll(".hn-cot span")].map((node) => node.textContent?.trim()),
    ownerText: owner?.textContent?.trim(),
    ownerHasDepartmentNode: Boolean(owner?.querySelector("i")),
    detailId: trigger?.getAttribute("aria-controls"),
  };
});
assert(desktop.headers[3] === "QA phụ trách", "Cột thứ tư phải dành riêng cho QA", desktop);
assert(!desktop.ownerHasDepartmentNode, "Hàng tóm tắt không được render bộ phận", desktop);
```

Sau khi click trigger, tìm `dt` có text `Phòng ban`, lấy `dd` kế tiếp và xác nhận còn dữ liệu. Click `.hn-muc__nut` của đúng hàng rồi xác nhận app chuyển sang màn tiến độ với deep-link của `data-progress-item` tương ứng. Ở viewport 390×844, xác nhận `documentElement.scrollWidth - clientWidth <= 1` và chiều cao nút chính `>= 43.5`.

- [ ] **Step 4: Chạy E2E để xác nhận đỏ**

Run:

```powershell
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/e2e/today-qa-ledger.mjs
```

Expected: FAIL tại header hoặc node phòng ban trong hàng tóm tắt.

### Task 2: Markup Today chỉ hiển thị QA trong hàng tóm tắt

**Files:**
- Modify: `src/features/today/TodayCommandCenter.tsx:120-180`
- Test: `tests/unit/today-command-center.test.mjs`
- Test: `tests/e2e/today-qa-ledger.mjs`

**Interfaces:**
- Consumes: `TodayActionRow.ownerName`, `TodayActionRow.department`, `TodayRowDetails`.
- Produces: `.hn-muc__nguoi` chỉ chứa tên QA; chi tiết vẫn chứa trường `Phòng ban`.

- [ ] **Step 1: Đổi nội dung hàng tóm tắt**

Thay markup người phụ trách bằng:

```tsx
<span className="hn-muc__nguoi"><b>{row.ownerName}</b></span>
```

Xóa span `.hn-muc__phong` khỏi `hn-muc__thong-tin`. Không xóa dòng sau trong `TodayRowDetails`:

```tsx
<div><dt>Phòng ban</dt><dd>{row.department || "Chưa xác định"}</dd></div>
```

- [ ] **Step 2: Đổi header cột**

Trong `TodayQueueSection`, dùng:

```tsx
<div className="hn-cot" aria-hidden="true">
  <span>Mã</span><span>Hạng mục</span><span>Mốc</span>
  <span>QA phụ trách</span><span>Trễ</span><span></span>
</div>
```

- [ ] **Step 3: Chạy unit và E2E**

Run:

```powershell
node --import tsx --test tests/unit/today-command-center.test.mjs
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/e2e/today-qa-ledger.mjs
```

Expected: nội dung/luồng xanh; kiểm tra thẩm mỹ có thể chưa hoàn tất cho tới Task 3.

### Task 3: Botanical QA Ledger responsive

**Files:**
- Modify: `src/features/today/today.css:277-end`
- Test: `tests/e2e/today-qa-ledger.mjs`

**Interfaces:**
- Consumes: `.hn-nhom--overdue`, `.lp-tone--*`, `.hn-muc__tre--*` và token `--lp-*` hiện có.
- Produces: Bảng sáu vùng, sắc thái Botanical, mobile card không tràn ngang.

- [ ] **Step 1: Thay khối bảng cuối file bằng lớp Botanical có phạm vi `.hn-nhom`**

Thiết lập các điểm chính sau bằng token, không thêm mã màu hex:

```css
.hn-nhom { position: relative; border-color: var(--lp-gold-hairline); background: var(--lp-bg-raised); }
.hn-nhom::before { content: ""; position: absolute; top: -24px; right: 28px; width: 92px; height: 58px; border: 1px solid var(--lp-gold-hairline); border-radius: 70% 30% 66% 34%; transform: rotate(16deg); pointer-events: none; opacity: .55; }
.hn-nhom__ten { position: relative; background: var(--lp-sheen); }
.hn-cot { background: var(--lp-sheen); border-color: var(--lp-gold-hairline); color: var(--lp-plum); font-weight: 700; }
.hn-muc:nth-child(even) { background: var(--lp-bg-sunken); }
.hn-muc:hover, .hn-muc:focus-within { background: var(--lp-rose-soft); }
.hn-nhom--overdue .hn-muc { box-shadow: inset 3px 0 0 var(--lp-danger); }
.hn-muc__tre { width: max-content; padding: 4px 9px; border: 1px solid currentColor; border-radius: 999px; }
```

Giữ grid desktop `190px minmax(0, 1fr) 116px minmax(0, 200px) 122px 152px`, loại bỏ selector `.hn-muc__phong`, và không dùng transform làm hàng dịch chuyển khi hover.

- [ ] **Step 2: Hoàn thiện mobile card**

Trong `@media (max-width: 768px)`, bảo đảm:

```css
.hn-muc__tom-tat { display: flex; flex-direction: column; align-items: stretch; gap: 10px; padding: 14px; }
.hn-muc__moc, .hn-muc__nguoi, .hn-muc__tre { display: inline-flex; grid-column: auto; }
.hn-muc__nut { width: 100%; min-height: 44px; }
.hn-cot { display: none; }
```

Giữ focus ring hiện tại và bổ sung `@media (prefers-reduced-motion: reduce)` nếu có transition mới.

- [ ] **Step 3: Chạy targeted E2E và chụp ảnh kiểm duyệt**

Run:

```powershell
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:VMP_E2E_SCREENSHOT='C:\Users\ADMIN\AppData\Local\Temp\vmp-today-qa-ledger.png'
node tests/e2e/today-qa-ledger.mjs
```

Expected: PASS; ảnh cho thấy bảng dễ quét, chỉ có tên QA ở cột phụ trách và không tràn mobile.

### Task 4: Verification và bàn giao

**Files:**
- Review: `src/features/today/TodayCommandCenter.tsx`
- Review: `src/features/today/today.css`
- Review: `tests/unit/today-command-center.test.mjs`
- Review: `tests/e2e/today-qa-ledger.mjs`

**Interfaces:**
- Consumes: toàn bộ thay đổi Task 1–3.
- Produces: bằng chứng bàn giao cho đúng phạm vi.

- [ ] **Step 1: Chạy gates mục tiêu**

```powershell
node --import tsx --test tests/unit/today-command-center.test.mjs
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/e2e/today-qa-ledger.mjs
npm run typecheck
```

- [ ] **Step 2: Chạy production build bằng `envDir` tạm**

Do ACL local chặn đọc `.env`, lấy hai biến public từ dev server `supabaseConfig.ts`, đặt vào process và gọi Vite `build({ envDir: temporaryDirectory })`. Expected: exit 0 và toàn bộ module được transform.

- [ ] **Step 3: Rà diff hẹp**

```powershell
git diff --check
git status --short -- src/features/today/TodayCommandCenter.tsx src/features/today/today.css tests/unit/today-command-center.test.mjs tests/e2e/today-qa-ledger.mjs
```

Xác nhận không có file Dữ liệu nguồn bị sửa. Không commit; bàn giao danh sách file, lý do và kết quả kiểm tra.
