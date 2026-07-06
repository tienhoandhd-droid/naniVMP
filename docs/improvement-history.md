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

## 2026-07-06 - Phase 7 - Unified day-axis milestone table

Pham vi:

- Dat `Bang ngay tong hop` lam che do mac dinh cua Timeline VMP.
- Thay bang cot trang thai tinh bang mot bang duy nhat co truc ngang theo ngay.
- Moi hang muc co ba lane rieng va dong bo theo cung truc ngay:
  - Hoan thanh De cuong.
  - Hoan thanh Tham dinh thuc te.
  - Hoan thanh VMP.
- Marker da hoan thanh dung ngay thuc te neu co; marker chua hoan thanh dung ngay
  han va doi mau theo sap den/qua han.
- Tach thong ke hoan thanh cua ba moc; bo `Ho so` khoi map ba moc va thay bang
  `De cuong`.
- Tu dong can truc nam vao `Hom nay` tren desktop.
- Tren mobile, tu dong can vao moc chua hoan thanh gan nhat de marker sap toi
  nam tron trong vung quan sat.
- Sap xep rieng bang tong hop theo moc chua hoan thanh sap toi; cac mode khac
  van giu thu tu theo dich VMP.
- Giu hai cot nhan dien/moc sticky tren desktop; thu gon cot nhan dien va cho
  cot moc cuon theo tren mobile.

Thay doi Supabase/n8n/GitHub remote:

- Chi doc du lieu hien co tu Supabase qua model `acts`.
- Khong co Supabase mutation.
- Khong co n8n mutation.
- Khong push, khong tao PR.

Kiem tra:

- `npm run build`: PASS.
- `git diff --check`: PASS.
- Browser QA desktop 1280x720: khong tran ngang toan trang, marker `Hom nay`
  hien trong bang, moi hang co dung 3 moc.
- Browser QA mobile 390x844: cot nhan dien khong de chu, marker sap toi nam tron
  trong vung lich va bang cuon ngang rieng.
- Thu tu dau bang la cac moc chua hoan thanh sap toi gan nhat.
- Console browser: khong co warning/error.

## 2026-07-06 - Phase 8 - Visual Explorer 2026 workbench

Pham vi:

- Nghien cuu cac pattern timeline/diagram/dashboard/table tu cac repo GitHub
  dang duoc dung rong rai trong nam 2025-2026:
  - visjs/vis-timeline: truc thoi gian, zoom/move, current marker.
  - xyflow/xyflow va AntV G6: node/edge, lane layout, detail khi chon node.
  - Apache ECharts va Tremor: KPI dashboard gon, thong tin uu tien o dau man.
  - Mermaid releases: timeline/architecture layout can nhan ngan va huong ro.
  - tldraw va Reagraph: zoom/focus/canvas co controls va tranh ve qua nhieu node.
  - TanStack Table: sticky header/column, scroll noi bo cho bang du lieu day.
- Them `docs/visual-explorer-research-2026.md` de luu nguon tham khao va quyet
  dinh thiet ke.
- Nang cap `Visual Explorer` thanh workbench gon:
  - console van hanh gom context, tabs, density, KPI pulse va filter trong mot
    cum ngan.
  - khong mo detail rong mac dinh; detail chi hien khi chon event/node/row.
  - timeline co truc thang rong hon, marker `Hom nay`, legend ngan va row bar
    theo trang thai.
  - so do co lane nguon/nhom doi tuong/bo phan/trang thai, zoom controls va
    selected node state.
  - dashboard co KPI chinh, strip KPI phu, pipeline 3 moc De cuong/Tham dinh
    thuc te/Hoan thanh VMP.
  - bang du lieu co sticky header/ma hang muc va scroll noi bo.
  - mobile giam chieu cao console, filter cuon ngang noi bo, khong tran ngang
    toan trang.
- Bo sung visual model cho 3 moc VMP: `phases`, `phaseDoneState`,
  `nextMilestone` va giu `_raw` de detail dung du lieu Supabase hien co.

Thay doi Supabase/n8n/GitHub remote:

- Chi doc du lieu Supabase hien co qua app runtime.
- Khong co Supabase mutation.
- Khong co n8n mutation.
- Phase nay duoc chuan bi de commit va push len `main` sau khi validation PASS
  theo yeu cau rieng cua nguoi dung.

Kiem tra:

- `git diff --check`: PASS.
- `npm run build`: PASS.
- Browser QA desktop 1280x720 tren `http://127.0.0.1:5174/`: 476 hang muc,
  214 doi tuong, khong tran ngang toan trang.
- Browser QA desktop: 4 tab Timeline/So do/Bo cuc/Bang chuyen duoc; So do co 16
  node va 28 lien ket; Bang co 476 dong trong khung scroll noi bo.
- Browser QA desktop: click timeline row mo detail panel ben phai; workspace
  chuyen sang layout detail ma `mainScrollWidth` van bang `mainClientWidth`.
- Browser QA mobile 390x844: `bodyScrollWidth = 390`, `mainScrollWidth = 390`,
  console giam tu khoang 525px xuong 364px, timeline bat dau trong viewport.
- Console browser: khong co warning/error.

Rui ro con lai:

- Chua them dependency diagram/table chuyen dung; phase nay giu custom CSS/React
  de bundle nhe va tranh doi contract du lieu.
- Viec dieu huong mobile cua shell tong the van phu thuoc layout hien co; Visual
  Explorer da duoc kiem khong tran ngang khi mo truc tiep trong viewport mobile.
