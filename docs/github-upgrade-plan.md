# Ke hoach nang cap GitHub cho VMP Monitor

Ngay lap: 2026-07-06

Muc tieu: bien repo thanh goi GitHub de hieu, de demo, de review va co the mo
rong thanh GitHub Pages/demo ma khong lam thay doi nguon du lieu Supabase hien co.

## Nguyen tac

- Chi doc du lieu runtime tu Supabase read model da co.
- Khong them duong ghi du lieu nghiep vu tu browser.
- Moi phase co dau vet trong `docs/improvement-history.md`.
- Uu tien tai lieu render duoc tren GitHub truoc khi them dependency nang.
- Neu can deploy Pages, push hoac tao PR thi phai co xac nhan rieng.

## Phase 1 - GitHub docs va README

Phan viec:

- Tao README co luong du lieu, cach chay, an toan va tai lieu tham khao.
- Ghi ro kien truc Supabase read model va Google Sheet canonical upstream.
- Tao plan nang cap va data contract doc lap voi UI.
- Sua `.env.example` de khong gay hieu nham ve nguon ghi.

Ket qua mong doi:

- Reviewer vao GitHub nam duoc ung dung trong 3 phut.
- Mermaid diagram render truc tiep tren README.
- Khong can dang nhap Supabase de hieu data flow.

## Phase 2 - Data contract visual

Phan viec:

- Them module chuyen `objects` va `acts` thanh visual model.
- Tao cac entity:
  - `TimelineEvent`
  - `DiagramNode`
  - `DiagramEdge`
  - `DashboardMetric`
- Bao toan `_raw` va cac truong hien co, khong sua RPC.

Ket qua mong doi:

- Timeline, diagram, dashboard dung chung mot contract.
- Co the test/inspect model bang code thuan ma khong can goi Supabase.

## Phase 3 - Visual Explorer trong app

Phan viec:

- Them menu "Visual Explorer".
- Them 4 che do xem:
  - Timeline strip
  - Process diagram
  - Dashboard layout
  - Data table
- Co filter theo trang thai, nhom, bo phan va tim kiem.
- Click node/event/row de xem detail.

Ket qua mong doi:

- Du lieu Supabase hien co co the doc nhu ban do.
- Reviewer thay duoc timeline, so do va bo cuc dashboard ngay trong app.

## Phase 4 - Validation va release package

Phan viec:

- Chay `npm run build`.
- Kiem tra git diff.
- Cap nhat history voi lenh da chay va rui ro con lai.
- Dung truoc `git push`/PR neu chua co yeu cau rieng.

Ket qua mong doi:

- Build pass.
- File thay doi ro rang.
- Co the tao commit/push o buoc sau neu duoc yeu cau.

## Reference stack

| Nhom | Lua chon uu tien | Ly do |
| --- | --- | --- |
| README diagram | Mermaid | GitHub render truc tiep, de review |
| Runtime diagram | Custom SVG hien tai, sau do co the nang len React Flow | Giu bundle nhe trong P0 |
| Timeline | Timeline custom hien co, tham khao vis-timeline/react-chrono | Repo da co timeline sau va gan domain |
| Dashboard layout | CSS Grid hien tai, sau do can nhac react-grid-layout | Chua can keo-tha trong P0 |
| Table | Bang thuan hien tai, sau do can nhac TanStack Table | Tranh tang dependency neu chua can server-side grid |

## Dieu kien de nang tiep len GitHub Pages

- Xac nhan co duoc expose du lieu demo hay khong.
- Neu du lieu that co nhay cam, can snapshot JSON da sanitize.
- Neu dung Supabase public runtime, can kiem tra RLS va scope anon key.
- Can workflow deploy rieng va xac nhan truoc khi push len remote.
