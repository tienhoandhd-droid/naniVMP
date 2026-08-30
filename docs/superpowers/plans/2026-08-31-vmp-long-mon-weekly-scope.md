# Ngư đồ Long Môn theo vùng tuần và phạm vi QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng ngư đồ ba tháng theo vùng tuần không chồng lấn, có sáu kiểu bơi và phạm vi Cả nhóm/Cá nhân đúng vai trò QA.

**Architecture:** Quyền/phạm vi nằm trong model thuần riêng và được `TimelineView` áp trước khi truyền dữ liệu cho `LongMonRace`. Model Long Môn xếp cá bằng hộp va chạm trên các lane theo vùng tuần; component chỉ render kết quả, điều khiển phạm vi và animation sprite. RPC/RLS không đổi vì server đã fail-closed theo phân công QA.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner + tsx, Puppeteer headless, Vite.

## Global Constraints

- Admin/Quản lý QA có `team | personal`; QA staff luôn là `personal` và không thấy selector.
- Lọc bằng `owner_person_id`/`support_person_id`, không dùng tên.
- Cá thuộc vùng tuần của deadline; ngày chính xác chỉ đọc khi mở chi tiết.
- Hộp cá + nhãn + biên animation cách nhau tối thiểu 8px; không `Math.random`, không giấu cá.
- Sprite di chuyển tối đa 4px/2°; `prefers-reduced-motion` tắt animation.
- Không sửa RPC, migration, dữ liệu remote, KPI hay bảng Timeline.
- Worktree đang có thay đổi người dùng chồng lên `App.tsx`/`TimelinePage.tsx`; không commit implementation để tránh cuốn thay đổi ngoài phạm vi.

---

### Task 1: Model phạm vi QA fail-closed

**Files:**
- Create: `src/features/monitoring/longMonRaceScope.ts`
- Test: `tests/unit/long-mon-race-scope.test.mjs`

**Interfaces:**
- Produces: `canChooseLongMonAudience(role)`, `resolveLongMonAudience(role, requested)`, `filterLongMonScopeActivities(input)`.
- Consumes: `Activity`, `BusinessRole` và person ID chính tắc.

- [ ] **Step 1: Viết test RED cho ma trận quyền và lọc owner/support**

```js
assert.equal(resolveLongMonAudience("qa_staff", "team"), "personal");
assert.equal(canChooseLongMonAudience("qa_manager"), true);
assert.deepEqual(filterLongMonScopeActivities({
  activities, businessRole: "qa_staff", currentPersonId: "qa-a",
  audience: "team", selectedPersonId: "qa-b",
}).map((a) => a.id), ["owner-a", "support-a"]);
```

- [ ] **Step 2: Chạy test và xác nhận FAIL do module chưa tồn tại**

Run: `node --import tsx --test tests/unit/long-mon-race-scope.test.mjs`

- [ ] **Step 3: Viết implementation tối thiểu**

```ts
export function resolveLongMonAudience(role: string | null, requested: LongMonAudience) {
  return role === "qa_staff" ? "personal" : requested;
}
```

`filterLongMonScopeActivities` trả `[]` khi QA staff thiếu `currentPersonId`, luôn bỏ qua person ID do client yêu cầu đối với QA staff, và giữ nguyên tập server cấp cho vai trò khác không có điều khiển.

- [ ] **Step 4: Chạy test GREEN**

Run: `node --import tsx --test tests/unit/long-mon-race-scope.test.mjs`

### Task 2: Bố cục vùng tuần không va chạm

**Files:**
- Modify: `src/features/monitoring/longMonRaceModel.ts`
- Modify: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Produces: `LongMonWeekBand[]`, `weekKey/weekLabel` trên cá, tọa độ `xPct/yPx/lane`, tỷ lệ và góc bơi tĩnh ổn định.
- Consumes: tập `Activity` đã lọc phạm vi.

- [ ] **Step 1: Đổi test cũ thành test RED theo vùng tuần và hộp va chạm**

```js
assert.equal(fishA.weekKey, fishB.weekKey); // hai ngày cùng tuần
assert.notEqual(fishA.xPct, exactDayPct);   // không ép vào tọa độ ngày
assert.equal(overlappingPairs(model.fish, 820), 0);
assert.deepEqual(layout(input), layout(input));
```

Thêm fixture 12 cá trong một tuần và cá ở hai tuần liền kề; hộp kiểm tra rộng 82px, cao 66px, gap 8px.

- [ ] **Step 2: Chạy test và xác nhận FAIL vì model chưa có week bands/collision layout**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

- [ ] **Step 3: Cài đặt week bands và lane allocator**

Chia cửa sổ ba tháng theo tuần lịch Thứ Hai–Chủ Nhật, clip hai đầu vào range. Với từng cá, dùng hash ID để sinh tọa độ giả ngẫu nhiên ổn định trong cụm tuần, bám các dòng cong so le; duyệt các track và chỉ nhận vị trí khi hộp hai chiều không va chạm. Tăng `laneCount` khi tuần đông. Không dùng `Math.random` và không dùng animation.

- [ ] **Step 4: Chạy test GREEN và giữ sáu test trạng thái hiện có**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

### Task 3: Điều khiển phạm vi và sáu dáng bơi tĩnh

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/TimelinePage.tsx`
- Modify: `src/features/monitoring/LongMonRace.tsx`
- Modify: `src/features/monitoring/long-mon-race.css`
- Modify: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- `TimelineView` thêm prop `currentPersonId?: string | null`.
- `LongMonRace` thêm prop `scopeControl` chứa audience, options, handlers, label và trạng thái fail-closed.

- [ ] **Step 1: Viết component contract RED**

Kiểm tra SSR có week labels, data-week, sáu class `long-mon-race__fish--*`, tọa độ và góc ổn định; kiểm tra CSS không có animation Long Môn; kiểm tra source contract rằng QA staff không render switch và manager có hai nút `aria-pressed`.

- [ ] **Step 2: Chạy test và xác nhận FAIL đúng contract mới**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs tests/unit/long-mon-race-scope.test.mjs`

- [ ] **Step 3: Nối state phạm vi trong TimelineView**

Tạo person choices bằng `buildPersonProgressChoices(acts)`, mặc định team cho Admin/Quản lý QA, personal cho QA staff; manager vào personal thì chọn current person nếu có, nếu không chọn option đầu. Chỉ `LongMonRace` nhận tập đã lọc. `App` truyền `currentPersonId`.

- [ ] **Step 4: Render control truy cập và week bands**

Dùng button `aria-pressed`, label/select thật, status `aria-live="polite"`; QA staff chỉ thấy “Ngư đồ của tôi”. Tài khoản QA thiếu person ID nhận empty state liên kết hồ sơ, không rơi về team.

- [ ] **Step 5: Thêm animation theo loài vào sprite/wake**

Tạo sáu keyframes riêng với translate ≤4px và rotate ≤2°. Button/wrapper/label đứng yên. Media query reduced-motion đặt `animation: none` cho sprite/wake nhưng giữ formation transform.

- [ ] **Step 6: Chạy unit + typecheck GREEN**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs tests/unit/long-mon-race-scope.test.mjs`

Run: `npm run typecheck`

### Task 4: E2E và kiểm tra hình ảnh

**Files:**
- Modify: `tests/e2e/long-mon-race.mjs`

**Interfaces:**
- Consumes: `data-week`, `data-collision-*`, scope controls và dialog chi tiết.

- [ ] **Step 1: Đổi E2E thành contract RED cho vùng tuần/scope**

Với fixture quản lý: xác nhận switch có hai lựa chọn; team có nhiều cá; personal chọn QA làm đổi/giảm số cá; không cặp rectangle nào giao nhau; click cá mở dialog chứa hạn VMP. Mobile không tràn document và viewport tự căn hôm nay.

- [ ] **Step 2: Build production bằng envDir tạm công khai**

Run Vite programmatic với `VITE_SUPABASE_URL=https://build.invalid` và anon placeholder vì ACL `.env` cục bộ đang lỗi; không đọc/in secret.

- [ ] **Step 3: Chạy E2E headless desktop/mobile**

Run: `$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'; $env:VMP_E2E_URL='http://127.0.0.1:<temporary-port>/'; node tests/e2e/long-mon-race.mjs`

- [ ] **Step 4: Xem ảnh, sửa thẩm mỹ nếu test vẫn xanh, rồi chạy lại gate cuối**

Run: unit scope + Long Môn, `npm run typecheck`, Vite production build, E2E headless, `git diff --check`.
