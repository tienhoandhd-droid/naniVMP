# VMP Long Môn Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa bản Long Môn V15 đã duyệt vào màn Giám sát → Dòng thời gian bằng dữ liệu VMP thật, trong đó mỗi hạng mục là một cá có loài/màu theo tiến độ và vị trí ngang theo hạn VMP.

**Architecture:** Tách một model thuần để xác định cửa sổ ba tháng, trạng thái sáu loài, vị trí deadline và luồng chống chồng lấn. Component React chỉ trình bày model trên tranh nền không cá bằng CSS sprite sheet, dùng native button để mở hồ sơ; `TimelinePage` truyền population đã lọc hiện hành và giữ nguyên quyền/API/RPC.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner + tsx, Puppeteer/Vite, PNG assets V15.

## Global Constraints

- Không sửa API, RPC, quyền, database hoặc dữ liệu VMP.
- Hạn VMP chính tắc là nguồn duy nhất quyết định vị trí ngang.
- Vị trí dọc chỉ chống chồng lấn, không mang ý nghĩa nghiệp vụ.
- Ánh xạ cố định: cá trê xám → chưa xong đề cương; lia thia lam → xong đề cương; chép ngọc → xong thực tế; thần tiên tím → xong báo cáo; rồng vàng → xong VMP; nóc đỏ → quá hạn VMP.
- Không mở thêm tab Chrome; kiểm tra giao diện bằng E2E headless mục tiêu.
- Tôn trọng `prefers-reduced-motion`; mọi cá dữ liệu là native button có tên truy cập và focus rõ.
- Giữ nguyên các dirty change ngoài phạm vi.

---

### Task 1: Model trường đua ba tháng

**Files:**
- Create: `src/features/monitoring/longMonRaceModel.ts`
- Create: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: `Activity`, `vmpDeadlineDate`, `isVmpComplete`, `classifyVmpDeadline`, `wlIsDone`.
- Produces: `LongMonRaceStage`, `LongMonRaceFish`, `LongMonRaceModel`, `longMonStageOf(activity, now)`, `buildLongMonRaceModel(activities, now)`.

- [ ] **Step 1: Viết test đỏ cho sáu trạng thái**

Tạo sáu fixture với `dl_vmp` trong cửa sổ và trạng thái raw tăng dần; assert lần lượt `catfish`, `betta`, `carp`, `angelfish`, `arowana`, `puffer`. Fixture quá hạn chưa hoàn tất phải thành `puffer`; VMP đã hoàn tất dù deadline cũ vẫn là `arowana`.

- [ ] **Step 2: Chạy test để xác nhận đỏ**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Viết test đỏ cho deadline, cửa sổ và luồng**

Với `now = 2026-08-31`, assert ba band là 07/2026, 08/2026, 09/2026; hạn 01/07 gần đầu, 30/09 gần cuối; item ngoài cửa sổ bị loại; item thiếu deadline được đếm riêng; ba item trùng ngày có lane khác nhau nhưng cùng `xPct`.

- [ ] **Step 4: Cài model tối thiểu**

Model dùng ngày local ở đầu tháng trước đến cuối tháng sau, sort theo deadline rồi mã hồ sơ, phân lane bằng khoảng cách ngang tối thiểu; không jitter trục x. `stageCounts` và `missingDeadlineCount` được tính từ cùng population.

- [ ] **Step 5: Chạy unit xanh**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: PASS.

### Task 2: Component nghệ thuật và asset production

**Files:**
- Create: `public/art/monitoring/long-mon-vmp-racecourse-v15.png`
- Create: `public/art/monitoring/long-mon-six-species-v15.png`
- Create: `src/features/monitoring/LongMonRace.tsx`
- Create: `src/features/monitoring/long-mon-race.css`
- Modify: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: `buildLongMonRaceModel`, hai PNG V15, `Activity[]`, callback `onOpen(Activity)`.
- Produces: `LongMonRace({ activities, now, onOpen })`.

- [ ] **Step 1: Thêm SSR contract test đỏ**

Render component với fixture và assert `aria-label="Trường đua hạn VMP ba tháng"`, ba nhãn tháng, native button cá có tên gồm mã + trạng thái + hạn, sáu mục legend có count, và thông báo thiếu deadline khi có.

- [ ] **Step 2: Chạy test để xác nhận đỏ**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì component chưa tồn tại.

- [ ] **Step 3: Chép hai asset đã duyệt vào public**

Sao chép bằng `Copy-Item` từ `.superpowers/brainstorm/94910-1788102465/content/`; không ghi đè file người dùng khác. Nền production là tranh không cá V14 được đặt tên V15; sprite là bảng RGBA sáu loài V15.

- [ ] **Step 4: Cài component semantic**

Render header gọn, hướng dòng nước, ba month bands, vạch hôm nay, vùng cá scroll dọc khi mật độ cao, button cá sprite theo `background-position`, mã hồ sơ nhỏ và tooltip/focus card. Legend hiển thị cả thumbnail loài, tên trạng thái và count; không dựa vào màu đơn độc.

- [ ] **Step 5: Cài CSS responsive**

Giữ background artwork qua lớp overlay yên ở giữa, fish target tối thiểu 44px, mobile dùng khung ngang `min-width` và scroll nội bộ thay vì làm tràn trang; animation chỉ dùng transform/opacity và tắt trong reduced motion.

- [ ] **Step 6: Chạy unit/typecheck checkpoint**

Run:

```powershell
node --import tsx --test tests/unit/long-mon-race.test.mjs
npm run typecheck
git diff --check -- src/features/monitoring/LongMonRace.tsx src/features/monitoring/longMonRaceModel.ts src/features/monitoring/long-mon-race.css tests/unit/long-mon-race.test.mjs
```

Expected: PASS.

### Task 3: Tích hợp vào Dòng thời gian thực tế

**Files:**
- Modify: `src/pages/TimelinePage.tsx`
- Modify: `src/main.tsx`
- Modify: `tests/unit/long-mon-race.test.mjs`

**Interfaces:**
- Consumes: `explorerActs`, `moHoSo`, `bangkokToday` của `TimelineView`.
- Produces: trường đua là lớp nhìn đầu tiên khi mở màn Timeline; click cá mở hồ sơ hiện hành.

- [ ] **Step 1: Thêm static integration test đỏ**

Assert `TimelinePage.tsx` import/render `LongMonRace`, truyền `activities={explorerActs}` và `onOpen={moHoSo}`; mặc định workspace là `timeline`, view là `month`; nhánh `view === "year"` không render rail cũ trùng với trường đua.

- [ ] **Step 2: Chạy test để xác nhận đỏ**

Run: `node --import tsx --test tests/unit/long-mon-race.test.mjs`

Expected: FAIL vì chưa tích hợp.

- [ ] **Step 3: Tích hợp tối thiểu**

Import component/CSS, render trường đua sau narrative và trước bản đồ tải việc khi `workspace === "timeline"`. Dùng `timelineToday` để đồng nhất ngày Bangkok. Giữ filter/model population hiện hành và callback chi tiết; không đổi quyền hay data fetching.

- [ ] **Step 4: Bỏ biểu đồ year rail trùng chức năng**

Khi chọn `Năm`, chỉ hiển thị gợi ý chọn Tháng/Quý để mở bảng chi tiết; trường đua ba tháng phía trên vẫn là bản đồ thời gian chính. Không xóa model cũ trong đợt hẹp này.

- [ ] **Step 5: Chạy unit/typecheck checkpoint**

Run:

```powershell
node --import tsx --test tests/unit/long-mon-race.test.mjs tests/unit/monitoring-journey.test.mjs
npm run typecheck
git diff --check -- src/pages/TimelinePage.tsx src/main.tsx src/features/monitoring tests/unit/long-mon-race.test.mjs
```

Expected: PASS.

### Task 4: E2E mục tiêu và gate cuối

**Files:**
- Create: `tests/e2e/long-mon-race.mjs`
- Review only: các file Task 1–3.

**Interfaces:**
- Consumes: fake Supabase harness hiện có, local preview tại `127.0.0.1:5199`.
- Produces: bằng chứng desktop/mobile, assets HTTP 200, thao tác mở hồ sơ và không gọi network ngoài mock.

- [ ] **Step 1: Viết E2E mục tiêu**

Mở `#v=timeline`, chờ `.long-mon-race`; assert đúng ba month band, có fish button từ fixture, `left` tăng theo deadline, click cá mở modal hồ sơ, sprite/background tải `naturalWidth > 0`, mobile 390px không làm tràn document và target không nhỏ hơn 44px.

- [ ] **Step 2: Chạy build preview và E2E**

Run:

```powershell
npm run build
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/e2e/long-mon-race.mjs
```

Expected: PASS; strict-network rỗng; screenshot desktop/mobile lưu trong `%TEMP%`.

- [ ] **Step 3: Gate cuối**

Run:

```powershell
node --import tsx --test tests/unit/long-mon-race.test.mjs tests/unit/monitoring-journey.test.mjs
npm run typecheck
npm run build
git diff --check -- src/features/monitoring src/pages/TimelinePage.tsx src/main.tsx tests/unit/long-mon-race.test.mjs tests/e2e/long-mon-race.mjs
```

Expected: PASS. Không chạy broad E2E/visual suite vì thay đổi chỉ ở màn Timeline.

- [ ] **Step 4: Bàn giao local**

Báo file đã đổi, lệnh/kết quả thực tế, screenshot, và rủi ro còn lại về mật độ nếu production có số lượng cá vượt xa fixture. Không commit/push/deploy.
