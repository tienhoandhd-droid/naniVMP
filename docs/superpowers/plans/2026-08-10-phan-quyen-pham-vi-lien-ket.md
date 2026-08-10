# Phân quyền phạm vi liên kết Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tinh gọn trang Phân quyền, thay các ô phạm vi và người thực hiện nhập tự do bằng lựa chọn có nguồn chuẩn, chọn nhiều theo `bộ phận → xưởng → khu vực → line`, và chỉ ghi khi người dùng bấm Lưu.

**Architecture:** Postgres giữ danh mục phạm vi phân cấp và khóa `person_id`; RPC trả một contract chuẩn cho UI và kiểm tra lại toàn bộ quan hệ trong transaction. React dùng các hàm lọc thuần và một thành phần chọn nhiều dùng chung; danh bạ là nơi duy nhất tạo/sửa tên, còn các màn nghiệp vụ chỉ chọn người có sẵn. Các cột tên legacy chỉ là bản sao hiển thị để giữ tương thích trong giai đoạn preview.

**Tech Stack:** PostgreSQL/Supabase migrations và RPC, React 18, TypeScript, Node test runner, Vite.

## Global Constraints

- Quan hệ phạm vi là `Bộ phận → Xưởng → Khu vực → Line`; khu vực bao trùm line.
- Bộ phận chính chọn một; phạm vi bộ phận, xưởng, khu vực và line chọn nhiều.
- Không suy đoán xưởng từ tên line; quan hệ chưa có trong danh mục chuẩn không được xuất hiện trong ô chọn.
- Không có ô nhập chuỗi tự do cho phạm vi hoặc cho thao tác gán người.
- Chọn, bỏ chọn, mất tiêu điểm hoặc bấm Enter không được tự gọi RPC ghi.
- Mọi thay đổi chỉ ghi sau nút **Lưu** hoặc **Áp dụng** có xác nhận.
- Tab Người thực hiện/Danh bạ là nơi duy nhất tạo hoặc sửa tên người; liên kết nghiệp vụ dùng `person_id`.
- Lưu lỗi phải rollback toàn bộ và giữ bản nháp trên giao diện.
- Giữ hệ thống ở `preview`; không tự bật `enforced`.
- Không xóa bảng/dữ liệu legacy trong migration này; chỉ bỏ các khối legacy khỏi giao diện.

---

## File Structure

- Create `src/features/itemPermissions/scopeHierarchy.ts`: kiểu dữ liệu, lọc tầng con và tính lựa chọn con bị vô hiệu hóa.
- Create `src/features/itemPermissions/LinkedMultiSelect.tsx`: ô chọn nhiều dùng chung, không biết cách lưu.
- Modify `src/features/itemPermissions/types.ts`: contract danh mục và bốn tập phạm vi.
- Modify `src/features/itemPermissions/api.ts`: decode/fetch danh mục, lưu phạm vi mới và tìm người theo `person_id`.
- Modify `src/features/itemPermissions/permissionWorkbook.ts`: đọc bốn tầng phạm vi bằng mã danh mục chuẩn.
- Modify `scripts/permission-workbook.mjs`: sinh file mẫu có cột xưởng, khu vực và line riêng.
- Modify `src/features/itemPermissions/StaffDirectoryPanel.tsx`: form tự điền và bốn ô chọn liên kết.
- Modify `src/features/itemPermissions/EffectiveRightsPanel.tsx`: hiện kết quả khớp đủ bốn tầng.
- Modify `src/features/itemPermissions/AssignmentPanel.tsx`: chọn mã hạng mục có sẵn, giữ người đã chọn bằng `person_id`.
- Create `src/features/itemPermissions/PerformerSelect.tsx`: lựa chọn một người đang hoạt động, hiện tên/email/bộ phận.
- Modify `src/components/dashboard/ProgressEditModal.tsx`: thay datalist tên tự do bằng `PerformerSelect`, lưu qua nút hiện có.
- Modify `src/pages/SourceCatalogPage.tsx`: QA phụ trách/người hỗ trợ và điền hàng loạt chỉ chọn người; sửa tại chỗ thành bản nháp có nút Lưu/Hủy.
- Modify `src/pages/PhanQuyenPage.tsx`: bỏ JSX và tải dữ liệu chỉ phục vụ các khối legacy.
- Create `supabase/migrations/20260810160000_pham_vi_xuong_khu_vuc_line_va_person_id.sql`: danh mục phân cấp, cột phạm vi/person_id, validation, RPC và backfill an toàn.
- Modify `src/types/database.ts`: kiểu schema tương ứng migration cho tới khi chạy lại `npm run gen:types` trên database đã migrate.
- Create `tests/unit/permission-scope.test.mjs`: test lọc/cascade thuần.
- Create `tests/unit/performer-selection.test.mjs`: test chuẩn hóa lựa chọn người và không chấp nhận tên tự do.
- Modify `tests/unit/item-permission-contracts.test.mjs`: test decoder/API contract mới.
- Modify `tests/unit/permission-workbook.test.mjs`: test import nhiều giá trị và quan hệ sai.
- Modify `tests/sql/item-permissions.sql`: ca hợp lệ, quan hệ sai, rollback, tên trùng và `person_id` không hoạt động.
- Modify `tests/e2e/danh-ba-phan-quyen.mjs`: kiểm trang chỉ còn workspace hiện hành, chọn nhiều và nút Lưu.

---

### Task 1: Logic phạm vi phân cấp thuần

**Files:**
- Create: `src/features/itemPermissions/scopeHierarchy.ts`
- Create: `tests/unit/permission-scope.test.mjs`

**Interfaces:**
- Produces: `ScopeOption`, `ScopeCatalog`, `ScopeSelection`, `filterScopeCatalog(catalog, selection)`, `pruneInvalidScope(catalog, selection)`, `resolveScopeCodes(catalog, codes)`.
- Consumes: không phụ thuộc React hoặc Supabase.

- [ ] **Step 1: Viết test đỏ cho lọc nhiều cha và cascade**

```js
test("lọc hợp nhất nhiều cha và loại con mất liên kết", async () => {
  const { filterScopeCatalog, pruneInvalidScope } = await import("../../src/features/itemPermissions/scopeHierarchy.ts");
  const catalog = {
    departments: [{ id: "qa", code: "QA", label: "QA" }, { id: "xsx", code: "XSX", label: "Xưởng sản xuất" }],
    factories: [
      { id: "f-qa", code: "FQA", label: "Xưởng QA", parentId: "qa" },
      { id: "f-xsx", code: "FXSX", label: "Xưởng SX", parentId: "xsx" },
    ],
    areas: [
      { id: "a-qa", code: "S1", label: "S1", parentId: "f-qa" },
      { id: "a-xsx", code: "C1", label: "C1", parentId: "f-xsx" },
    ],
    lines: [
      { id: "l-qa", code: "LQA", label: "Line QA", parentId: "a-qa" },
      { id: "l-xsx", code: "BFS", label: "BFS", parentId: "a-xsx" },
    ],
  };
  const selection = {
    departments: ["qa", "xsx"], factories: ["f-qa", "f-xsx"],
    areas: ["a-qa", "a-xsx"], lines: ["l-qa", "l-xsx"],
  };
  assert.deepEqual(filterScopeCatalog(catalog, selection).factories.map(x => x.id), ["f-qa", "f-xsx"]);
  assert.deepEqual(pruneInvalidScope(catalog, { ...selection, factories: ["f-xsx"] }), {
    departments: ["qa", "xsx"], factories: ["f-xsx"], areas: ["a-xsx"], lines: ["l-xsx"],
  });
});
```

- [ ] **Step 2: Chạy test và xác nhận đỏ**

Run: `node --import tsx --test tests/unit/permission-scope.test.mjs`  
Expected: FAIL vì module `scopeHierarchy.ts` chưa tồn tại.

- [ ] **Step 3: Cài đặt kiểu và hàm thuần tối thiểu**

```ts
export interface ScopeOption { id: string; code: string; label: string; parentId: string }
export interface ScopeCatalog {
  departments: Array<Omit<ScopeOption, "parentId">>;
  factories: ScopeOption[]; areas: ScopeOption[]; lines: ScopeOption[];
}
export interface ScopeSelection {
  departments: string[]; factories: string[]; areas: string[]; lines: string[];
}
const inSet = (values: string[]) => new Set(values);
export function filterScopeCatalog(c: ScopeCatalog, s: ScopeSelection): ScopeCatalog {
  const departments = inSet(s.departments);
  const factories = c.factories.filter((item) => departments.has(item.parentId));
  const selectedFactories = inSet(s.factories);
  const areas = c.areas.filter((item) => selectedFactories.has(item.parentId));
  const selectedAreas = inSet(s.areas);
  const lines = c.lines.filter((item) => selectedAreas.has(item.parentId));
  return { departments: c.departments, factories, areas, lines };
}
export function pruneInvalidScope(c: ScopeCatalog, s: ScopeSelection): ScopeSelection {
  const departmentIds = new Set(c.departments.map((item) => item.id));
  const departments = s.departments.filter((id) => departmentIds.has(id));
  const factories = s.factories.filter((id) => c.factories.some((item) => item.id === id && departments.includes(item.parentId)));
  const areas = s.areas.filter((id) => c.areas.some((item) => item.id === id && factories.includes(item.parentId)));
  const lines = s.lines.filter((id) => c.lines.some((item) => item.id === id && areas.includes(item.parentId)));
  return { departments, factories, areas, lines };
}
export type ScopeCodeSelection = ScopeSelection;
export type ScopeResolution = { ok: true; selection: ScopeSelection } | { ok: false; error: string };
export function resolveScopeCodes(c: ScopeCatalog, codes: ScopeCodeSelection): ScopeResolution {
  const ids = (options: Array<{ id: string; code: string }>, values: string[]) => values.map((code) =>
    options.find((item) => item.code.toLocaleLowerCase("vi") === code.toLocaleLowerCase("vi"))?.id ?? "");
  const selection = {
    departments: ids(c.departments, codes.departments), factories: ids(c.factories, codes.factories),
    areas: ids(c.areas, codes.areas), lines: ids(c.lines, codes.lines),
  };
  if (Object.values(selection).some((values) => values.includes(""))) return { ok: false, error: "Mã phạm vi không tồn tại" };
  const pruned = pruneInvalidScope(c, selection);
  if (JSON.stringify(pruned) !== JSON.stringify(selection)) return { ok: false, error: "Quan hệ phạm vi không hợp lệ" };
  return { ok: true, selection };
}
```

- [ ] **Step 4: Bổ sung test lựa chọn nhiều, danh mục rỗng, mã lạ và giữ thứ tự ổn định**

Run: `node --import tsx --test tests/unit/permission-scope.test.mjs`  
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/features/itemPermissions/scopeHierarchy.ts tests/unit/permission-scope.test.mjs
git commit -m "feat(phân quyền): thêm logic phạm vi liên kết"
```

### Task 2: Schema danh mục và RPC nguyên khối

**Files:**
- Create: `supabase/migrations/20260810160000_pham_vi_xuong_khu_vuc_line_va_person_id.sql`
- Modify: `tests/sql/item-permissions.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces tables `vmp_scope_factories`, `vmp_scope_areas`, `vmp_scope_lines` với khóa UUID và FK cha.
- Produces columns `vmp_performers.scope_factory_ids`, `scope_area_ids`, `scope_line_ids`, `version`.
- Produces columns `vmp_source_objects.owner_person_id`, `support_person_id`.
- Produces RPC `rpc_item_permission_scope_catalog()`, bản cập nhật `rpc_item_permission_directory(text)`, `rpc_upsert_item_permission_staff(uuid,jsonb,text,integer)`, `rpc_preview_item_rights(uuid,text)`, `rpc_item_permission_preflight()` và `rpc_set_item_performer_by_id(text,uuid,text)`.

- [ ] **Step 1: Thêm ca SQL đỏ**

```sql
begin;
insert into public.vmp_scope_factories(id, code, name, department_id)
values ('10000000-0000-0000-0000-000000000001', 'X1', 'Xưởng 1', 'xsx');
insert into public.vmp_scope_areas(id, code, name, factory_id)
values ('20000000-0000-0000-0000-000000000001', 'C1', 'Khu vực C1', '10000000-0000-0000-0000-000000000001');
insert into public.vmp_scope_lines(id, code, name, area_id)
values ('30000000-0000-0000-0000-000000000001', 'BFS', 'BFS', '20000000-0000-0000-0000-000000000001');
do $$ begin
  if not public.vmp_valid_permission_scope(
    array['xsx'],
    array['10000000-0000-0000-0000-000000000001']::uuid[],
    array['20000000-0000-0000-0000-000000000001']::uuid[],
    array['30000000-0000-0000-0000-000000000001']::uuid[]
  ) then raise exception 'phạm vi đúng phải hợp lệ'; end if;
  if public.vmp_valid_permission_scope(
    array['qa'],
    array['10000000-0000-0000-0000-000000000001']::uuid[],
    array['20000000-0000-0000-0000-000000000001']::uuid[],
    array['30000000-0000-0000-0000-000000000001']::uuid[]
  ) then raise exception 'xưởng ngoài bộ phận phải bị từ chối'; end if;
end $$;
rollback;
```

- [ ] **Step 2: Viết migration bảng và ràng buộc**

```sql
create table public.vmp_scope_factories (
  id uuid primary key default gen_random_uuid(), code text not null,
  name text not null, department_id text not null references public.departments(id),
  is_active boolean not null default true, unique (department_id, code)
);
create table public.vmp_scope_areas (
  id uuid primary key default gen_random_uuid(), code text not null, name text not null,
  factory_id uuid not null references public.vmp_scope_factories(id),
  is_active boolean not null default true, unique (factory_id, code)
);
create table public.vmp_scope_lines (
  id uuid primary key default gen_random_uuid(), code text not null, name text not null,
  area_id uuid not null references public.vmp_scope_areas(id),
  is_active boolean not null default true, unique (area_id, code)
);
```

- [ ] **Step 3: Thêm cột, backfill không đoán xưởng và chỉ mục**

Không tạo factory từ chuỗi line. Chỉ backfill `owner_person_id`/`support_person_id` khi tên chuẩn hóa khớp duy nhất một người đang hoạt động; các tên mơ hồ giữ `NULL` và xuất hiện trong preflight.

- [ ] **Step 4: Viết validation/RPC và RLS**

RPC lưu nhận `p_expected_version`; khóa dòng `FOR UPDATE`, kiểm quyền, kiểm đủ đường department→factory→area→line, cập nhật một lần và ghi audit trước/sau. Cấp `EXECUTE` đúng `authenticated`; thu `public, anon`; hàm `SECURITY DEFINER` đặt `search_path = public, pg_temp`.

```sql
create or replace function public.vmp_valid_permission_scope(
  p_departments text[], p_factories uuid[], p_areas uuid[], p_lines uuid[]
) returns boolean language sql stable set search_path = public, pg_temp as $$
  select cardinality(p_departments) > 0
    and cardinality(p_factories) > 0
    and cardinality(p_areas) > 0
    and cardinality(p_lines) > 0
    and not exists (
      select 1 from unnest(p_factories) id
      left join public.vmp_scope_factories f on f.id = id and f.is_active
      where f.id is null or not (f.department_id = any(p_departments))
    )
    and not exists (
      select 1 from unnest(p_areas) id
      left join public.vmp_scope_areas a on a.id = id and a.is_active
      where a.id is null or not (a.factory_id = any(p_factories))
    )
    and not exists (
      select 1 from unnest(p_lines) id
      left join public.vmp_scope_lines l on l.id = id and l.is_active
      where l.id is null or not (l.area_id = any(p_areas))
    );
$$;
```

- [ ] **Step 5: Cập nhật kiểu database và kiểm tra tĩnh migration**

Run: `npm run typecheck`  
Expected: PASS sau khi kiểu Row/Insert/Update/RPC args phản ánh schema mới.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260810160000_pham_vi_xuong_khu_vuc_line_va_person_id.sql tests/sql/item-permissions.sql src/types/database.ts
git commit -m "feat(phân quyền): thêm danh mục xưởng khu vực line"
```

### Task 3: Contract TypeScript và API danh mục

**Files:**
- Modify: `src/features/itemPermissions/types.ts`
- Modify: `src/features/itemPermissions/api.ts`
- Modify: `src/features/itemPermissions/permissionWorkbook.ts`
- Modify: `scripts/permission-workbook.mjs`
- Modify: `tests/unit/item-permission-contracts.test.mjs`
- Modify: `tests/unit/permission-workbook.test.mjs`

**Interfaces:**
- `DirectoryPerson` thêm `scope_factory_ids`, `scope_area_ids`, `scope_line_ids`, `version`.
- `PermissionPersonPatch` gửi bốn tập phạm vi và `expected_version` qua tham số RPC riêng.
- `fetchScopeCatalog(): Promise<ScopeCatalog>`.
- `searchActivePerformers(query): Promise<DirectoryPerson[]>` dùng cùng danh bạ chuẩn.

- [ ] **Step 1: Viết test decoder đỏ**

```js
assert.deepEqual(decodeDirectoryPerson(fixture).scope_factory_ids, ["factory-1"]);
assert.equal(decodeDirectoryPerson(fixture).version, 3);
await assert.rejects(() => decodeDirectoryPerson({ ...fixture, scope_line_ids: [7] }), /scope_line_ids/);
```

- [ ] **Step 2: Chạy test và xác nhận đỏ**

Run: `node --import tsx --test tests/unit/item-permission-contracts.test.mjs`  
Expected: FAIL vì contract chưa có trường mới.

- [ ] **Step 3: Cập nhật type, decoder và RPC wrapper**

`savePermissionPerson(personId, patch, reason, expectedVersion)` phải truyền `p_expected_version`; không nhét version vào patch allowlist.

- [ ] **Step 4: Chạy test contract và typecheck**

Mở rộng workbook thành 11 cột: chín cột hiện tại, thay `Phạm vi`/`Khu vực phân quyền` bằng bốn cột `Phạm vi bộ phận`, `Phạm vi xưởng`, `Phạm vi khu vực`, `Phạm vi line`. Parser đổi mã sang ID bằng `ScopeCatalog` và trả lỗi theo đúng dòng nếu quan hệ cha–con sai.

```ts
export interface PermissionWorkbookOptions { scopeCatalog: ScopeCatalog }
const selection = resolveScopeCodes(options.scopeCatalog, {
  departments: splitCell(row["Phạm vi bộ phận"]),
  factories: splitCell(row["Phạm vi xưởng"]),
  areas: splitCell(row["Phạm vi khu vực"]),
  lines: splitCell(row["Phạm vi line"]),
});
if (!selection.ok) rowErrors.push(selection.error);
```

Run: `npm run test:unit && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/itemPermissions/types.ts src/features/itemPermissions/api.ts src/features/itemPermissions/permissionWorkbook.ts scripts/permission-workbook.mjs tests/unit/item-permission-contracts.test.mjs tests/unit/permission-workbook.test.mjs
git commit -m "feat(phân quyền): nối API phạm vi phân cấp"
```

### Task 4: Ô chọn nhiều liên kết và form danh bạ

**Files:**
- Create: `src/features/itemPermissions/LinkedMultiSelect.tsx`
- Modify: `src/features/itemPermissions/StaffDirectoryPanel.tsx`
- Modify: `src/features/itemPermissions/EffectiveRightsPanel.tsx`
- Modify: `src/index.css`
- Modify: `tests/e2e/danh-ba-phan-quyen.mjs`

**Interfaces:**
- `LinkedMultiSelect({label, options, selected, disabledReason, onChange})` chỉ phát sự kiện bản nháp.
- `StaffDirectoryPanel` tải `fetchScopeCatalog()` một lần, lọc parent-first và gọi một RPC duy nhất khi bấm Lưu.

- [ ] **Step 1: Bổ sung kiểm tra E2E đỏ cho bốn ô và nút Lưu**

Kiểm `aria-label` lần lượt là `Phạm vi bộ phận`, `Phạm vi xưởng`, `Phạm vi khu vực`, `Phạm vi line`; chọn hai giá trị không làm xuất hiện thông báo “Đã lưu” trước khi bấm `Lưu hồ sơ`.

```js
await page.click('[aria-label="Phạm vi bộ phận"]');
await page.click('[role="option"][data-value="qa"]');
assert(!(await page.$eval('body', el => el.innerText)).includes('Đã lưu hồ sơ danh bạ'));
await page.click('button[data-testid="save-permission-person"]');
await page.waitForFunction(() => document.body.innerText.includes('Đã lưu hồ sơ danh bạ'));
```

- [ ] **Step 2: Cài đặt `LinkedMultiSelect`**

Thành phần dùng button/listbox/checkbox, thẻ giá trị đã chọn, tìm kiếm, xóa từng thẻ và lý do khóa. Không import API lưu.

```tsx
import { useState } from "react";
export default function LinkedMultiSelect(props: LinkedMultiSelectProps) {
  const { label, options, selected, disabledReason, onChange } = props;
  const [open, setOpen] = useState(false);
  const toggleId = (values: string[], id: string) => values.includes(id)
    ? values.filter((value) => value !== id) : [...values, id];
  return <div className="ip-multi">
    <button type="button" aria-label={label} aria-expanded={open}
      disabled={Boolean(disabledReason)} onClick={() => setOpen((value) => !value)}>
      {selected.length ? `${selected.length} đã chọn` : disabledReason || "— chọn —"}
    </button>
    {open && <div role="listbox" aria-multiselectable="true">
      {options.map((option) => <button type="button" role="option"
        data-value={option.id} aria-selected={selected.includes(option.id)}
        onClick={() => onChange(toggleId(selected, option.id))}>{option.label}</button>)}
    </div>}
  </div>;
}
```

- [ ] **Step 3: Thay hai input chuỗi bằng bốn selector liên kết**

Khi bỏ cha làm mất con, mở xác nhận liệt kê tên con; hủy thì phục hồi cha, xác nhận thì dùng `pruneInvalidScope` cập nhật bản nháp.

- [ ] **Step 4: Lưu và tải lại quyền hiệu lực**

Sau RPC thành công, chọn lại bản ghi trả về theo `person_id`, cập nhật version và tăng `refreshKey` cho `EffectiveRightsPanel`; lỗi giữ nguyên form.

- [ ] **Step 5: Chạy test**

Run: `npm run test:unit && npm run typecheck && npm run build`  
Expected: PASS. E2E chạy khi môi trường đã áp migration: `node tests/e2e/danh-ba-phan-quyen.mjs`.

- [ ] **Step 6: Commit**

```bash
git add src/features/itemPermissions/LinkedMultiSelect.tsx src/features/itemPermissions/StaffDirectoryPanel.tsx src/features/itemPermissions/EffectiveRightsPanel.tsx src/index.css tests/e2e/danh-ba-phan-quyen.mjs
git commit -m "feat(phân quyền): chọn nhiều phạm vi liên kết"
```

### Task 5: Một nguồn tên người thực hiện

**Files:**
- Create: `src/features/itemPermissions/PerformerSelect.tsx`
- Create: `src/features/itemPermissions/performerSelection.ts`
- Create: `tests/unit/performer-selection.test.mjs`
- Modify: `src/components/dashboard/ProgressEditModal.tsx`
- Modify: `src/pages/SourceCatalogPage.tsx`
- Modify: `src/lib/supabaseData.ts`

**Interfaces:**
- `PerformerChoice { personId: string; fullName: string; email: string | null; department: string | null }`.
- `PerformerSelect({ value, options, allowClear, onChange })` không nhận chuỗi tùy ý.
- `setItemPerformerById(validationCode, personId, reason)` gọi RPC mới.

- [ ] **Step 1: Viết test đỏ cho lựa chọn bằng ID**

```js
test("chỉ chấp nhận person_id có trong options", async () => {
  const { resolvePerformerChoice } = await import("../../src/features/itemPermissions/performerSelection.ts");
  assert.equal(resolvePerformerChoice("p-1", people)?.fullName, "Nguyễn An");
  assert.equal(resolvePerformerChoice("Nguyễn An", people), null);
});
```

- [ ] **Step 2: Cài đặt helper và `PerformerSelect`**

Danh sách hiển thị `Họ tên · email · bộ phận`; `value` là `personId`; không render input text tự do hoặc datalist.

```tsx
export default function PerformerSelect({ value, options, allowClear = true, onChange }: Props) {
  return <select value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
    {allowClear && <option value="">— chưa phân công —</option>}
    {options.map((person) => <option key={person.personId} value={person.personId}>
      {person.fullName} · {person.email || "chưa có email"} · {person.department || "chưa có bộ phận"}
    </option>)}
  </select>;
}
```

- [ ] **Step 3: Thay ô Người thực hiện trong tiến độ**

Giữ lựa chọn trong state tới khi người dùng bấm nút Lưu hiện có; gọi `setItemPerformerById` cùng lý do. Không gọi RPC trong `onChange`.

```tsx
<PerformerSelect value={performerPersonId} options={performerChoices}
  onChange={(personId) => setPerformerPersonId(personId)} />
// Chỉ trong handleSave:
await setItemPerformerById(act.id, performerPersonId, reason.trim());
```

- [ ] **Step 4: Thay QA phụ trách/Người hỗ trợ ở Danh mục nguồn**

Modal sửa và điền hàng loạt dùng `PerformerSelect`. Sửa tại chỗ hai cột người mở editor có nút **Lưu/Không lưu**, không dùng `onBlur={saveCell}`. Các cột khác giữ hành vi hiện tại để tránh mở rộng phạm vi.

```tsx
{PERSON_FIELDS.has(f.key) && here ? <div className="source-person-draft">
  <PerformerSelect value={cell.personId} options={performerChoices}
    onChange={(personId) => setCell({ ...cell, personId })} />
  <button type="button" onClick={savePersonCell}>Lưu</button>
  <button type="button" onClick={() => setCell(null)}>Không lưu</button>
</div> : null}
```

- [ ] **Step 5: Giữ tab Người thực hiện là nơi tạo tên**

`SimpleEditModal` của dataset `performers` vẫn có input tên và nút Lưu; server chặn trùng tên chuẩn hóa. Mọi dataset khác không được tạo tên mới.

```ts
const isAuthoritativePerformerName = spec.id === "performers" && f.key === "performer_name";
// Chỉ nhánh này render <input>; các trường gán người dùng PerformerSelect.
```

- [ ] **Step 6: Chạy test và commit**

Run: `node --import tsx --test tests/unit/performer-selection.test.mjs && npm run typecheck && npm run build`  
Expected: PASS.

```bash
git add src/features/itemPermissions/PerformerSelect.tsx src/features/itemPermissions/performerSelection.ts tests/unit/performer-selection.test.mjs src/components/dashboard/ProgressEditModal.tsx src/pages/SourceCatalogPage.tsx src/lib/supabaseData.ts
git commit -m "feat(nhập liệu): chỉ chọn người từ danh bạ"
```

### Task 6: Tinh gọn trang Phân quyền

**Files:**
- Modify: `src/pages/PhanQuyenPage.tsx`
- Modify: `tests/e2e/danh-ba-phan-quyen.mjs`

**Interfaces:**
- Trang giữ `StaffDirectoryPanel`, `AssignmentPanel`, `EffectiveRightsPanel`; không tải state/API chỉ dùng cho ba khối legacy.

- [ ] **Step 1: Thêm assertion E2E đỏ**

```js
assert(!(await pageText()).includes("1 · Ai được phép có tài khoản"));
assert(!(await pageText()).includes("2 · Vai nào làm gì"));
assert(!(await pageText()).includes("3 · Ma trận trách nhiệm & quyền"));
assert((await pageText()).includes("Quyền hiệu lực theo từng đầu mục"));
```

- [ ] **Step 2: Xóa JSX legacy và dead state/import/helper**

Giữ guard quyền truy cập quản lý bộ phận và workspace hiện hành. Không xóa RPC/table legacy trong task này.

- [ ] **Step 3: Chạy kiểm tra tĩnh và build**

Run: `npm run typecheck && npm run build`  
Expected: PASS và không có import/biến chết.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PhanQuyenPage.tsx tests/e2e/danh-ba-phan-quyen.mjs
git commit -m "refactor(phân quyền): bỏ các khối legacy"
```

### Task 7: Kiểm thử tích hợp và bàn giao

**Files:**
- Modify: `docs/HANDOVER.md`
- Modify: `tests/e2e/README.md`

**Interfaces:**
- Ghi rõ migration phải được áp dụng trước E2E và danh mục xưởng không được tự suy đoán.

- [ ] **Step 1: Chạy toàn bộ kiểm tra không cần database đã migrate**

Run: `npm run test:unit && npm run typecheck && npm run build`  
Expected: tất cả exit 0.

- [ ] **Step 2: Rà migration và SQL test trong database tạm đã áp migration**

Run trong môi trường Supabase local/staging được phép: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f tests/sql/item-permissions.sql`  
Expected: transaction test hoàn tất và rollback fixture; không chạy lệnh này trên production nếu chưa có phê duyệt triển khai migration.

- [ ] **Step 3: Chạy E2E sau khi môi trường test đã migrate**

Run: `node tests/e2e/danh-ba-phan-quyen.mjs`  
Expected: chọn nhiều, lưu thủ công, chọn người bằng ID và ẩn legacy đều PASS.

- [ ] **Step 4: Cập nhật bàn giao**

Ghi migration mới, thứ tự nạp danh mục xưởng–khu vực–line, trạng thái `preview`, cách xử lý dòng tên chưa nối và lệnh kiểm tra.

- [ ] **Step 5: Rà diff cuối và commit**

```bash
git diff --check
git status --short
git add docs/HANDOVER.md tests/e2e/README.md
git commit -m "docs(phân quyền): bàn giao phạm vi liên kết"
```

- [ ] **Step 6: Xác minh lịch sử commit**

Run: `git log --oneline -10`  
Expected: có commit cho logic, schema, API, UI phạm vi, người thực hiện, tinh gọn trang và bàn giao; `.superpowers/` không bị đưa vào commit.
