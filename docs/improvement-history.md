# Lich su cai tien VMP Monitor

File nay ghi lai tung buoc cai tien theo yeu cau "ghi lai lich su sau moi buoc".
Moi muc nen neu ro phase, file tac dong, lenh kiem tra va rui ro con lai.

## 2026-07-06 - Phase 1 - GitHub docs foundation

Pham vi:

- Tao `README.md` de GitHub co mo ta ro ve VMP Monitor, data flow, cach chay,
  chinh sach an toan va reference stack.
- Tao `docs/github-upgrade-plan.md` de chia roadmap thanh 4 phase.
- Tao `docs/data-contract.md` de chot contract giua Supabase data va cac view
  timeline/diagram/dashboard.
- Cap nhat `.env.example` de thong diep cau hinh khop voi che do Sheet-canonical
  va Supabase read-only.

Thay doi Supabase/n8n/GitHub remote:

- Khong co Supabase mutation.
- Khong co n8n mutation.
- Khong push, khong tao PR.

Kiem tra:

- Chua chay build o phase nay. Build se chay sau khi hoan tat cac phase code.

Rui ro con lai:

- README chua co screenshot that vi can chay app va chup sau khi Visual Explorer
  hoan tat.

## 2026-07-06 - Phase 2 - Visual data contract

Pham vi:

- Them `src/lib/visualModel.js`, module thuan JavaScript de chuyen `objects` va
  `acts` da doc tu Supabase thanh:
  - `timelineEvents`
  - `diagramNodes`
  - `diagramEdges`
  - `dashboardMetrics`
- Contract khong goi network, khong ghi Supabase, khong goi n8n.
- Logic owner/status/class/department duoc chuan hoa tai mot noi de cac view sau
  co the dung chung.

Thay doi Supabase/n8n/GitHub remote:

- Khong co Supabase mutation.
- Khong co n8n mutation.
- Khong push, khong tao PR.

Kiem tra:

- Chua chay build o phase nay. Build se chay sau khi gan Visual Explorer vao UI.

Rui ro con lai:

- Can Phase 3 de render contract nay trong UI va phat hien loi import/runtime neu co.

## 2026-07-06 - Phase 3 - Visual Explorer UI

Pham vi:

- Them `src/pages/VisualExplorerPage.jsx`.
- Them menu `Visual Explorer` trong nhom Phan tich.
- Gan router trong `src/App.jsx`.
- Trang moi doc `objects` va `acts` tu state hien co, sau do render:
  - Timeline strip.
  - So do quan he Supabase -> nhom doi tuong -> bo phan -> trang thai.
  - Bo cuc KPI/dashboard.
  - Bang du lieu co click detail.
- Them filter theo trang thai, nhom, bo phan va tim kiem.

Thay doi Supabase/n8n/GitHub remote:

- Khong co Supabase mutation.
- Khong co n8n mutation.
- Khong push, khong tao PR.

Kiem tra:

- Chua chay build tai thoi diem ghi muc nay. Phase 4 se chay build va cap nhat
  ket qua.

Rui ro con lai:

- Can build de bat loi import/CSS runtime.
- Chua co screenshot GitHub that cho README.

## 2026-07-06 - Phase 4 - Validation

Pham vi:

- Chay build production.
- Chay `git diff --check`.
- Chay secret scan pattern chat tren README, docs, src va `.env.example`.

Lenh da chay:

```bash
npm run build
git diff --check
rg -n "<secret-token-patterns>" README.md docs src .env.example
```

Ket qua:

- `npm run build`: PASS.
- `git diff --check`: PASS.
- Secret scan pattern chat: PASS, khong co match.

Thay doi Supabase/n8n/GitHub remote:

- Khong co Supabase mutation.
- Khong co n8n mutation.
- Khong push, khong tao PR.

Rui ro con lai:

- Chua chup screenshot that cho README.
- `src/index.css` va `src/pages/TimelinePage.jsx` da co thay doi dang do truoc
  phase nay; da duoc giu nguyen va chi bo sung them CSS namespace `visual-*`.

## 2026-07-06 - Phase 5 - Timeline VMP map refinement

Pham vi:

- Nang cap rieng khu vuc `Ban do timeline VMP · Nam 2026`.
- Tham khao cac pattern timeline/Gantt pho bien:
  - axis/zoom/current marker tu vis-timeline.
  - density grid va load rail tu gantt-schedule-timeline-calendar.
  - layout mode ro rang tu React Chrono.
  - Gantt/doc-friendly tu Mermaid.
- Chuyen mac dinh timeline sang mode `So do + Gantt`.
- Them insight strip gom khung quan sat, cao diem deadline, moc nong va nhip
  hoan thanh.
- Them range rail/mini-map theo thang hoac tuan, co marker `Hom nay`, load bar,
  ty le hoan thanh va so luong can chu y.
- Click band nam/quy se drill-down ve thang tuong ung.

Thay doi Supabase/n8n/GitHub remote:

- Khong co Supabase mutation.
- Khong co n8n mutation.
- Khong push, khong tao PR.

Kiem tra:

- `npm run build`: PASS.
- `git diff --check`: PASS.

Rui ro con lai:

- Chua visual QA bang browser sau dang nhap vi can phien/credential de vao man
  hinh timeline voi du lieu that.

## 2026-07-06 - Phase 6 - Time-column chart for Timeline VMP

Pham vi:

- Chuyen range rail thanh bieu do cot chay theo truc thoi gian.
- Chieu cao moi cot the hien tong deadline trong tuan/thang tuong ung.
- Moi cot duoc xep chong theo ba trang thai: hoan thanh, dang chay va can chu y.
- Dat tong so tren dinh cot, ty le hoan thanh duoi nhan thoi gian.
- Giu marker `Hom nay` va hanh vi click cot nam/quy de drill-down vao thang.
- Bo sung duong tham chieu ngang va responsive cho man hinh hep.

Thay doi Supabase/n8n/GitHub remote:

- Khong co Supabase mutation.
- Khong co n8n mutation.
- Khong push, khong tao PR.

Kiem tra:

- `npm run build`: PASS.
- `git diff --check`: PASS.
- Browser QA desktop 1280x720: 12 cot thang, khong tran ngang toan trang.
- Browser QA mobile 390x844: bieu do cuon ngang rieng, khong de chu.
- Click cot `T1`: drill-down dung ve 5 cot tuan cua Thang 1/2026.
- Console browser: khong co warning/error.
