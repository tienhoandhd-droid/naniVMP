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
