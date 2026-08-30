# Source QA Entry Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm vùng Đối tượng của Dữ liệu nguồn thành bàn nhập liệu nhanh cho QA, với thanh hành động gọn, bảng dễ quét và mobile không tràn mà không đổi nghiệp vụ Source.

**Architecture:** Giữ nguyên `CatalogWorkspaceShell` làm orchestration và toàn bộ API/model hiện có. Chỉ tổ chức lại markup hành động trong shell, thay view-model trình bày của `CatalogSmartTable`, rồi thêm CSS được scope bằng `.cw-workspace`/`.cw-bang--objects`; `SmartTable`, RPC và quyền không đổi.

**Tech Stack:** React 19, TypeScript, CSS token Lotus, Node test runner + React SSR, Puppeteer E2E với Supabase giả lập, Vite.

## Global Constraints

- Không thay đổi dữ liệu, quyền, RPC, RLS, phân trang, bộ lọc, nhập Excel, hàng chờ áp dụng, lịch sử, optimistic locking hoặc luật sinh timeline.
- Không sửa Dòng thời gian VMP, Gantt, sơ đồ hoặc `WorkloadSpace3D` trong kế hoạch này.
- Không thay đổi component `SmartTable` dùng chung nếu class/markup riêng của Source giải quyết được yêu cầu.
- Desktop mục tiêu 1440px; mobile mục tiêu 390×844px; nút mobile tối thiểu 44px; không tràn ngang toàn trang.
- Cảnh báo chặn timeline vẫn mở mặc định.
- Dùng token Lotus hiện có; không thêm dependency, ảnh nền hoặc màu hex mới.
- Giữ toàn bộ thay đổi local hiện có; không reset/restore/checkout và không commit trong phiên kiểm duyệt local.

---

### Task 1: Khóa hợp đồng trình bày bằng test đỏ

**Files:**
- Create: `tests/unit/source-qa-entry-workbench.test.mjs`
- Create: `tests/e2e/source-qa-entry-workbench.mjs`
- Read: `tests/e2e/gia-lap-supabase.mjs`
- Read: `tests/e2e/chrome-path.mjs`

**Interfaces:**
- Consumes: `CatalogSmartTableProps`, `CatalogListRow`, `caiGiaLap(page, options)`, `nhetPhien(page, options)`.
- Produces: hợp đồng DOM `data-cw-tools`, `data-cw-primary-bar`, `.cw-doi-tuong`, `.cw-bang--objects`, nhãn `Cập nhật` và E2E desktop/mobile.

- [ ] **Step 1: Viết unit test đỏ cho bảng đối tượng**

Tạo fixture một dòng đối tượng và render `CatalogSmartTable` bằng `renderToStaticMarkup`. Khóa các yêu cầu:

```js
const html = renderToStaticMarkup(React.createElement(CatalogSmartTable, {
  dataset: "objects",
  rows: [{
    recordId: "obj-1", businessKey: "TB-100", version: 3,
    data: {
      object_code: "TB-100", object_name: "Máy dập viên xoay tròn",
      department: "XSX", area_code: "KV-A", validate_flag: "y",
      first_month: 1, frequency_months: 12, owner_name: "Nguyễn An",
      criticality_score: 7,
    },
  }],
  canEdit: true,
  onEdit: () => {},
  expandedRowId: null,
  onExpandedRowChange: () => {},
}));

assert.match(html, /class="cw-bang cw-bang--objects"/);
assert.match(html, /<span class="cw-doi-tuong__ma cw-ma">TB-100<\/span>/);
assert.match(html, /<span class="cw-doi-tuong__ten">Máy dập viên xoay tròn<\/span>/);
assert.match(html, />Đối tượng</);
assert.match(html, />Lịch thẩm định</);
assert.match(html, />Cập nhật</);
assert.doesNotMatch(html, />Mã đối tượng</);
assert.doesNotMatch(html, />Tên</);
```

- [ ] **Step 2: Chạy unit test và xác nhận đỏ**

Run: `node --import tsx --test tests/unit/source-qa-entry-workbench.test.mjs`

Expected: FAIL vì wrapper/cell/header mới chưa tồn tại và nút còn ghi `Sửa`.

- [ ] **Step 3: Viết E2E đỏ cho thanh hành động, đúng bản ghi và responsive**

E2E dùng phiên Admin giả lập, mở `#v=source`, rồi kiểm tra:

```js
const desktop = await page.$eval(".cw-workspace", (root) => ({
  primaryBar: Boolean(root.querySelector("[data-cw-primary-bar]")),
  toolsOpen: root.querySelector("[data-cw-tools]")?.hasAttribute("open"),
  headers: [...root.querySelectorAll(".cw-bang--objects thead th")]
    .map((node) => node.textContent?.trim()).filter(Boolean),
  objectWidth: root.querySelector(".cw-doi-tuong")?.getBoundingClientRect().width,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));

assert(desktop.primaryBar, "Source phải có thanh tác vụ QA chính", desktop);
assert(desktop.toolsOpen === false, "Công cụ dữ liệu phải đóng mặc định", desktop);
assert(desktop.headers.includes("Đối tượng") && desktop.headers.includes("Lịch thẩm định"),
  "Bảng phải dùng cột nghiệp vụ đã duyệt", desktop);
assert((desktop.objectWidth ?? 0) >= 220, "Tên đối tượng phải có đủ bề ngang", desktop);
```

Sau đó mở `Công cụ dữ liệu`, xác nhận đúng ba hành động theo quyền; click `Cập nhật` của dòng đầu và xác nhận dialog chứa đúng mã; mở panel bộ lọc và xác nhận `aria-expanded`; chuyển viewport 390×844 và xác nhận page overflow ≤1 cùng mọi nút thẻ ≥43.5px.

- [ ] **Step 4: Chạy E2E và xác nhận đỏ**

Run:

```powershell
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/e2e/source-qa-entry-workbench.mjs
```

Expected: FAIL ở `data-cw-primary-bar`, `data-cw-tools` hoặc header/cell mới.

---

### Task 2: Tổ chức lại thanh hành động QA

**Files:**
- Modify: `src/features/catalogWorkspace/CatalogWorkspaceShell.tsx:578-655`
- Test: `tests/e2e/source-qa-entry-workbench.mjs`

**Interfaces:**
- Consumes: state/callback hiện có `moBoLocObj`, `setMoBoLocObj`, `taiLai`, `xuatExcel`, `setMoSinh`, `moThem` và capability booleans.
- Produces: disclosure `details[data-cw-tools]`, vùng `data-cw-primary-bar`, không đổi callback hoặc điều kiện quyền.

- [ ] **Step 1: Rút mô tả workspace nhưng giữ metadata**

Thay copy role-aware dài bằng câu ngắn:

```tsx
<p className="cw-mota">
  <span>{canEdit
    ? "Sổ dữ liệu nguồn — tìm, kiểm tra và cập nhật đối tượng có lưu lý do."
    : "Sổ dữ liệu nguồn — các đối tượng trong phạm vi bạn được quyền xem."}</span>
  {scopeLabel && <span className="cw-mota__phamvi">Phạm vi: {scopeLabel}</span>}
  {updatedLabel && <span className="cw-mota__moc">{updatedLabel}</span>}
</p>
```

- [ ] **Step 2: Đưa tác vụ chính vào một CommandBar**

Trong vùng `objects`, giữ tìm kiếm + Bộ lọc ở main và `+ Thêm đối tượng` ở trailing. Gắn `data-cw-primary-bar` vào wrapper riêng để E2E đo layout:

```tsx
<div className="cw-primary-bar" data-cw-primary-bar>
  <CommandBar label="Nhập liệu đối tượng" trailing={coThem && (
    <button type="button" className="cw-nut cw-nut--chinh" data-cw-them onClick={moThem}>
      <Plus size={15} aria-hidden="true" /> Thêm đối tượng
    </button>
  )}>
    <div className="cw-tim">
      <Search size={15} aria-hidden="true" className="cw-tim__icon" />
      <input className="cw-tim__o" aria-label="Tìm trong danh mục"
        placeholder="Tìm theo mã, tên, bộ phận…" value={q}
        onChange={(e) => { setQ(e.target.value); setTrang(0); setExpandedId(null); }} />
    </div>
    <button type="button" className="cw-nut" data-cw-filter-toggle
      aria-expanded={moBoLocObj} aria-controls="cw-object-filter-panel"
      onClick={() => setMoBoLocObj((mo) => !mo)}>
      Bộ lọc{objFilterCount > 0 ? ` (${objFilterCount})` : ""}
    </button>
  </CommandBar>
</div>
```

Các dataset khác tiếp tục dùng CommandBar hiện hành để tránh mở rộng phạm vi.

- [ ] **Step 3: Gom công cụ quản trị bằng disclosure ngữ nghĩa**

Đặt sau CommandBar của `objects`:

```tsx
<details className="cw-tools" data-cw-tools>
  <summary>Công cụ dữ liệu</summary>
  <div className="cw-tools__actions" role="group" aria-label="Công cụ dữ liệu nguồn">
    <button type="button" className="cw-nut" onClick={taiLai}>
      <RefreshCw size={15} aria-hidden="true" /> Tải lại
    </button>
    <button type="button" className="cw-nut" disabled={!hasAuthorizationRevision} onClick={xuatExcel}>
      <Download size={15} aria-hidden="true" /> Xuất Excel
    </button>
    {canSinhTimeline && hasAuthorizationRevision && (
      <button type="button" className="cw-nut" onClick={() => setMoSinh(true)}>
        <CalendarPlus size={15} aria-hidden="true" /> Sinh timeline
      </button>
    )}
  </div>
</details>
```

Không render bản sao ba nút trong thanh chính.

- [ ] **Step 4: Chạy E2E mục tiêu**

Run: `node tests/e2e/source-qa-entry-workbench.mjs`

Expected: vượt qua phần disclosure/quyền, vẫn đỏ ở bảng/CSS chưa triển khai.

---

### Task 3: Dựng bảng/thẻ đối tượng theo nhịp QA

**Files:**
- Modify: `src/features/catalogWorkspace/CatalogSmartTable.tsx`
- Test: `tests/unit/source-qa-entry-workbench.test.mjs`
- Test: `tests/e2e/source-qa-entry-workbench.mjs`

**Interfaces:**
- Consumes: cùng `CatalogListRow[]`, `canEdit`, `onEdit`, expanded row callbacks.
- Produces: `NutCapNhat`, `.cw-doi-tuong`, `.cw-ke-hoach`, wrapper `.cw-bang--<dataset>`; không đổi public props.

- [ ] **Step 1: Đổi nút hành động nhưng giữ callback**

```tsx
function NutCapNhat({ row, onEdit }: { row: CatalogListRow; onEdit: (r: CatalogListRow) => void }) {
  return (
    <button type="button" className="cw-sua" data-cw-sua
      onClick={() => onEdit(row)} aria-label={`Cập nhật ${row.businessKey}`}>
      Cập nhật
    </button>
  );
}
```

Dùng component này ở bảng, chi tiết và thẻ mobile.

- [ ] **Step 2: Gộp mã và tên vào cột Đối tượng**

Hai cột đầu của dataset `objects` trở thành:

```tsx
{
  id: "doituong", header: "Đối tượng",
  cell: (r) => (
    <span className="cw-doi-tuong">
      <span className="cw-doi-tuong__ma cw-ma">{r.businessKey}</span>
      <span className="cw-doi-tuong__ten">{doc(r.data.object_name)}</span>
    </span>
  ),
},
```

Đổi header `Kế hoạch thẩm định` thành `Lịch thẩm định`; giữ cell status/tháng/tần suất và các cột còn lại đúng spec.

- [ ] **Step 3: Thêm tên vào thẻ mobile và giữ cùng rows**

Trong `duKienThe("objects", d)`, phần tử đầu tiên là tên đối tượng; tiếp theo là bộ phận/khu vực, QA và lịch thẩm định. Không tạo query hoặc mảng dữ liệu riêng cho mobile.

```tsx
if (dataset === "objects") {
  const phamVi = [tenBoPhan(d.department), doc(d.area_code)]
    .filter((value) => value !== "—").join(" · ") || "—";
  return [
    doc(d.object_name),
    `Phạm vi: ${phamVi}`,
    `QA: ${doc(d.owner_name)}`,
    thieuThangDau(d) ? "Thiếu tháng thẩm định đầu tiên"
      : d.first_month != null
        ? `Lịch: T${d.first_month} · ${doc(d.frequency_months)} tháng/lần`
        : "Ngoài kế hoạch thẩm định",
  ];
}
```

- [ ] **Step 4: Scope CSS theo dataset bằng wrapper**

Bao cặp `SmartTable`/`MobileTaskList` bằng:

```tsx
<div className={`cw-bang cw-bang--${dataset}`}>
  <SmartTable<CatalogListRow>
    caption={TEN_BANG[dataset]}
    rows={rows}
    rowKey={khoa}
    columns={cot}
    empty={khongCo}
    renderExpandedRow={dataset === "objects"
      ? (row) => <ChiTietDoiTuong row={row} canEdit={canEdit} onEdit={onEdit} />
      : undefined}
    expandedRowId={dataset === "objects" ? expandedRowId : undefined}
    onExpandedRowChange={dataset === "objects" ? onExpandedRowChange : undefined}
  />
  <MobileTaskList<CatalogListRow>
    label={TEN_BANG[dataset]}
    rows={rows}
    rowKey={khoa}
    empty={khongCo}
    renderItem={(row) => (
      <div className="cw-the">
        <div className="cw-the__dau">
          <b className="cw-ma">{row.businessKey}</b>
          {theTrangThaiCua(dataset, row.data)}
        </div>
        {duKienThe(dataset, row.data).map((dong) => (
          <div key={dong} className="cw-the__dong">{dong}</div>
        ))}
        {canEdit && <NutCapNhat row={row} onEdit={onEdit} />}
      </div>
    )}
  />
</div>
```

- [ ] **Step 5: Chạy unit test và E2E**

Run:

```powershell
node --import tsx --test tests/unit/source-qa-entry-workbench.test.mjs tests/unit/catalog-warnings-summary.test.mjs
node tests/e2e/source-qa-entry-workbench.mjs
```

Expected: unit xanh; E2E chỉ còn có thể đỏ ở kích thước/overflow trước Task 4.

---

### Task 4: Hoàn thiện Botanical Source Ledger và responsive

**Files:**
- Modify: `src/styles/catalog-workspace.css:309-618`
- Test: `tests/e2e/source-qa-entry-workbench.mjs`

**Interfaces:**
- Consumes: class/attributes từ Tasks 2–3.
- Produces: layout desktop một hàng, cột đối tượng ≥220px trong viewport mục tiêu, mobile 44px và không overflow.

- [ ] **Step 1: Tạo thanh QA và disclosure nghệ thuật nhưng kín đáo**

Thêm CSS scope Source:

```css
.cw-primary-bar .lp-command-bar { flex-wrap: nowrap; border-color: var(--lp-gold-hairline); background: var(--lp-bg-raised); }
.cw-primary-bar .lp-command-bar__main { flex: 1 1 auto; min-width: 0; }
.cw-primary-bar .cw-tim { flex: 1 1 360px; }
.cw-tools { align-self: flex-start; }
.cw-tools > summary { min-height: 40px; display: inline-flex; align-items: center; cursor: pointer; color: var(--lp-plum); }
.cw-tools__actions { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 8px; }
```

Summary có focus ring và che marker mặc định bằng CSS nhưng giữ semantics `<details>/<summary>`.

- [ ] **Step 2: Cân lại dải loại, cảnh báo và bảng**

- Dải loại dùng gold hairline, active plum và pseudo-element lá nhỏ.
- Override `.cw-workspace .vmp-catalog-warnings*` để giảm padding/gap, không đổi `open`.
- `.cw-bang--objects .lp-smart-table__table` dùng `table-layout: fixed`; cột Đối tượng chiếm 28%, Lịch 20%, QA 12%, hai cột hành động mỗi cột 10%.
- `.cw-doi-tuong` là flex column; tên dùng line-height dễ đọc, không `word-break: break-all`.
- Hàng hover/focus dùng rose soft; không dùng màu làm chỉ báo duy nhất.

```css
.cw-kind { padding: 4px; border-bottom: 1px solid var(--lp-gold-hairline); }
.cw-kind__muc { position: relative; border-color: var(--lp-gold-hairline); }
.cw-kind__muc.is-mo::before {
  content: "";
  width: 8px;
  height: 6px;
  border-radius: 75% 25% 75% 25%;
  background: currentColor;
  transform: rotate(35deg);
}
.cw-workspace .vmp-catalog-warnings { margin-top: 0; }
.cw-workspace .vmp-catalog-warnings__groups { gap: 6px; margin-top: 6px; }
.cw-workspace .vmp-catalog-warning summary { min-height: 40px; padding: 8px 12px; }
.cw-workspace .vmp-catalog-warning__body { padding: 8px 12px 10px 36px; }
.cw-bang--objects .lp-smart-table__table { width: 100%; table-layout: fixed; }
.cw-bang--objects .lp-smart-table__th:nth-child(1) { width: 28%; }
.cw-bang--objects .lp-smart-table__th:nth-child(2) { width: 13%; }
.cw-bang--objects .lp-smart-table__th:nth-child(3) { width: 20%; }
.cw-bang--objects .lp-smart-table__th:nth-child(4) { width: 12%; }
.cw-bang--objects .lp-smart-table__th:nth-child(5) { width: 7%; }
.cw-bang--objects .lp-smart-table__th:nth-child(6),
.cw-bang--objects .lp-smart-table__th:nth-child(7) { width: 10%; }
.cw-doi-tuong { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cw-doi-tuong__ten { color: var(--lp-ink); font-weight: 650; line-height: 1.45; overflow-wrap: break-word; }
.cw-bang--objects .lp-smart-table__tr:hover,
.cw-bang--objects .lp-smart-table__tr:focus-within { background: var(--lp-rose-soft); }
```

- [ ] **Step 3: Chốt breakpoint desktop/laptop/mobile**

Ở ≤1180px, ẩn cột supporting theo luật hiện có nhưng không ẩn danh tính/lịch/action. Ở ≤768px:

```css
.cw-primary-bar .lp-command-bar { flex-direction: column; align-items: stretch; }
.cw-primary-bar .lp-command-bar__trailing,
.cw-primary-bar .cw-nut--chinh { width: 100%; }
.cw-primary-bar button,
.cw-tools summary,
.cw-tools button { min-height: 44px; }
.cw-bang--objects { max-width: 100%; overflow: clip; }
```

Thêm `prefers-reduced-motion: reduce` cho transition mới.

- [ ] **Step 4: Chạy E2E với ảnh kiểm duyệt**

Run:

```powershell
$env:VMP_E2E_SCREENSHOT='C:\Users\ADMIN\AppData\Local\Temp\vmp-source-qa-workbench.png'
node tests/e2e/source-qa-entry-workbench.mjs
```

Expected: PASS; xem ảnh desktop/mobile để bảo đảm tên không xuống từng từ, cảnh báo không che bảng và hành động chính rõ nhất.

---

### Task 5: Cổng xác minh và bàn giao local

**Files:**
- Verify only: các file đã sửa ở Tasks 1–4

**Interfaces:**
- Consumes: cây local hoàn chỉnh.
- Produces: bằng chứng kiểm thử và danh sách diff phạm vi Source; không commit/push.

- [ ] **Step 1: Chạy test mục tiêu Source**

Run:

```powershell
node --import tsx --test tests/unit/source-qa-entry-workbench.test.mjs tests/unit/catalog-warnings-summary.test.mjs tests/unit/catalog-workspace-filter-model.test.mjs
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/e2e/source-qa-entry-workbench.mjs
```

Expected: mọi test PASS, zero failures.

- [ ] **Step 2: Chạy E2E catalog hiện có vì dùng chung workspace**

Run: `node tests/e2e/catalog-workspace.mjs`

Expected: PASS. Nếu test rộng ngoài phạm vi thất bại vì fixture/pre-existing issue, ghi rõ và chỉ sửa khi lỗi nằm ở boundary Source vừa đổi.

- [ ] **Step 3: Chạy typecheck và build**

Run: `npm run typecheck`.

Build: dùng `npm run build` nếu ACL `.env` cho phép. Nếu Windows từ chối đọc `.env`, lấy hai biến Vite công khai từ dev server, chạy Vite programmatic với `envDir` tạm như phiên trước; không sửa quyền file và không in token ra log.

Expected: exit 0. Ghi riêng warning Vite có sẵn, không gọi warning là lỗi.

- [ ] **Step 4: Rà diff và whitespace**

Run:

```powershell
git diff --check
git status --short
git diff -- src/features/catalogWorkspace/CatalogWorkspaceShell.tsx src/features/catalogWorkspace/CatalogSmartTable.tsx src/styles/catalog-workspace.css tests/unit/source-qa-entry-workbench.test.mjs tests/e2e/source-qa-entry-workbench.mjs
```

Expected: không có whitespace error; không có file Timeline/3D trong diff của tác vụ này.

- [ ] **Step 5: Bàn giao để người dùng duyệt local**

Báo file đã sửa, lý do, test/build, warning còn lại, URL `http://127.0.0.1:5199/#v=source`, và xác nhận không commit/push.
