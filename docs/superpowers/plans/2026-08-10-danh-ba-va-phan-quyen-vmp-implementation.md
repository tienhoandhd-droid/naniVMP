# VMP Staff Directory and Item Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây một danh bạ nhân sự & quyền duy nhất, tự nối tên/tài khoản, tính quyền theo phân công + phạm vi + khu vực, và giới hạn QA/bộ phận quản lý thiết bị theo đúng từng cột timeline mà không bật cưỡng chế trước khi Admin chủ động duyệt.

**Architecture:** Nâng `vmp_performers` thành nguồn nhân sự chuẩn, còn `vmp_item_assignments` chỉ giữ khóa liên kết tới người và hạng mục. PostgreSQL là nơi duy nhất tính quyền hiệu lực và kiểm allowlist trường; React chỉ hiển thị kết quả từ RPC. Chế độ `preview` cho nhập, xem và audit toàn bộ cấu hình nhưng giữ luật đang chạy; `enforced` chỉ mở được qua RPC tiền kiểm của Admin.

**Tech Stack:** PostgreSQL 17/Supabase RLS + SECURITY DEFINER RPC, React 18, TypeScript 7, Vite 5, Supabase JS 2, SheetJS (`xlsx`), Node `node:test`, Puppeteer E2E, GitHub Pages.

## Global Constraints

- Bản deploy đầu tiên phải giữ `item_permissions_mode = "preview"`; không tự động bật `enforced`.
- Mỗi tài khoản có đúng một `access_class`: `view_only`, `qa_progress_editor`, `qa_manager`, `equipment_scheduler`, hoặc `equipment_manager`.
- Mã nhân viên được phép trống trong bản đầu; nếu có thì phải duy nhất.
- Khớp tên bằng tên chuẩn hóa chính xác: bỏ khoảng trắng thừa, không phân biệt hoa–thường, giữ nguyên dấu; không fuzzy match.
- Người trùng tên hoặc tên không khớp duy nhất không nhận quyền cho tới khi được nối tay.
- Nhân viên thường chỉ thấy hạng mục khi đồng thời có phân công, đúng phạm vi bộ phận và đúng khu vực/line.
- QA chỉ cập nhật `actual_protocol_date`, `status_protocol`, `actual_validation_date`, `status_validation`, `actual_report_date`, `status_report`, `actual_vmp_date`, `status_vmp`.
- Bộ phận quản lý thiết bị chỉ cập nhật `scheduled_at`; bộ phận này lấy từ `vmp_objects.department`, không mặc định là XSX.
- Patch có một trường trái phép phải bị từ chối toàn bộ transaction.
- Quyền thật sau khi nối luôn neo bằng `user_id`; tên chỉ dùng cho bước đối chiếu dữ liệu nguồn.
- Mọi RPC mới phải `SET search_path = public, pg_temp`, revoke khỏi `public, anon`, và chỉ grant đúng `authenticated`/`service_role`.
- Không sửa migration lịch sử; mọi thay đổi database là migration forward-only mới trong `supabase/migrations/`.
- Không commit `.env`, `.env.local`, `.superpowers/`, chuỗi kết nối hoặc service-role key.

---

## File Structure

- `supabase/migrations/20260810080000_danh_ba_phan_quyen_preview.sql`: mở rộng danh bạ, tạo phân công, chế độ preview và `scheduled_at`.
- `supabase/migrations/20260810090000_rpc_danh_ba_va_phan_cong.sql`: autocomplete, CRUD danh bạ, nhập Excel và phân công có kiểm quản lý.
- `supabase/migrations/20260810100000_tinh_quyen_hieu_luc.sql`: lõi quyền xem/sửa, giải thích quyền và tiền kiểm bật áp dụng.
- `supabase/migrations/20260810110000_quyen_tung_cot_timeline.sql`: allowlist cột trong `rpc_update_progress` và đồng bộ datetime.
- `supabase/migrations/20260810120000_rls_doc_theo_hang_muc.sql`: RLS/RPC đọc chống lộ dữ liệu khi `enforced`.
- `src/features/itemPermissions/types.ts`: kiểu dữ liệu và hằng số năm phân loại.
- `src/features/itemPermissions/api.ts`: toàn bộ lời gọi RPC của tính năng.
- `src/features/itemPermissions/permissionWorkbook.ts`: đọc/kiểm tra file Excel phía trình duyệt.
- `src/features/itemPermissions/StaffDirectoryPanel.tsx`: danh bạ, autocomplete, trạng thái tài khoản và nhập Excel.
- `src/features/itemPermissions/AssignmentPanel.tsx`: phân công theo người/hạng mục và nguồn phân công.
- `src/features/itemPermissions/EffectiveRightsPanel.tsx`: ma trận quyền dự kiến, lý do và lỗi tiền kiểm.
- `src/pages/PhanQuyenPage.tsx`: giữ ma trận quyền hiện có và ghép ba panel mới thành khu “Quyền theo hạng mục”.
- `src/components/dashboard/ProgressEditModal.tsx`: hiển thị cột được sửa theo quyền hiệu lực và dùng `datetime-local` cho lịch.
- `src/lib/supabaseData.ts`: ánh xạ `lich_td -> scheduled_at` và adapter RPC.
- `src/types/domain.ts`: bổ sung quyền trường và giá trị lịch đủ ngày giờ cho `Activity`.
- `src/index.css`: kiểu bảng danh bạ, badge preview, autocomplete và ma trận quyền.
- `scripts/permission-workbook.mjs`: sinh workbook chuẩn không macro.
- `scripts/test-item-permissions-sql.sh`: áp migration trong một transaction kiểm thử rồi rollback.
- `tests/unit/permission-workbook.test.mjs`: kiểm dropdown, sheet hướng dẫn và dữ liệu nhiều phạm vi/khu vực.
- `tests/sql/item-permissions.sql`: kiểm database bằng transaction rollback với JWT giả lập.
- `tests/e2e/danh-ba-phan-quyen.mjs`: luồng autocomplete/import/lưu dự thảo.
- `tests/e2e/quyen-cot-timeline.mjs`: QA và bộ phận quản lý thiết bị chỉ sửa đúng cột.
- `tests/e2e/ma-tran-phan-quyen.mjs`: cập nhật mock RPC để giữ hồi quy màn hiện có.
- `public/templates/phan-quyen-vmp.xlsx`: file mẫu tải trực tiếp từ web.
- `n8n/wf-04-canonical-sync/parse-sheet-csv.js`: giữ giá trị lịch có giờ trong payload canonical.
- `n8n/wf-04-canonical-sync/apply-canonical-snapshot.sql`: ghi `scheduled_at` nhưng vẫn tương thích `scheduled_date`.
- `package.json`: thêm lệnh unit/SQL/E2E mới.

---

### Task 1: Khóa hợp đồng dữ liệu và kiểm thử nền

**Files:**
- Create: `src/features/itemPermissions/types.ts`
- Create: `tests/unit/item-permission-contracts.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: năm phân loại và luật hai chiều trong đặc tả.
- Produces: `ACCESS_CLASSES`, `QA_TIMELINE_FIELDS`, `EQUIPMENT_TIMELINE_FIELDS`, `normalizePersonName()` và lệnh `npm run test:unit`.

- [ ] **Step 1: Viết test hợp đồng thất bại**

```js
// tests/unit/item-permission-contracts.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCESS_CLASSES, QA_TIMELINE_FIELDS, EQUIPMENT_TIMELINE_FIELDS,
  normalizePersonName,
} from "../../src/features/itemPermissions/types.ts";

test("phân loại và allowlist không chồng nhau", () => {
  assert.deepEqual(ACCESS_CLASSES.map((x) => x.id), [
    "view_only", "qa_progress_editor", "qa_manager",
    "equipment_scheduler", "equipment_manager",
  ]);
  assert.equal(QA_TIMELINE_FIELDS.length, 8);
  assert.deepEqual(EQUIPMENT_TIMELINE_FIELDS, ["scheduled_at"]);
  assert.deepEqual(QA_TIMELINE_FIELDS.filter((x) => EQUIPMENT_TIMELINE_FIELDS.includes(x)), []);
});

test("tên chỉ chuẩn hóa khoảng trắng và hoa thường", () => {
  assert.equal(normalizePersonName("  Đặng   Thị Hồng Ngọc "), "đặng thị hồng ngọc");
  assert.notEqual(normalizePersonName("Đặng Thị Hồng Ngọc"), normalizePersonName("Dang Thi Hong Ngoc"));
});
```

- [ ] **Step 2: Thêm test runner TypeScript và chạy để thấy fail**

```bash
npm install --save-dev tsx@4.20.6
```

```json
"test:unit": "node --import tsx --test tests/unit/*.test.mjs"
```

Run: `npm run test:unit`

Expected: FAIL vì `src/features/itemPermissions/types.ts` chưa tồn tại.

- [ ] **Step 3: Viết module hợp đồng tối thiểu**

```ts
export const ACCESS_CLASSES = [
  { id: "view_only", label: "Chỉ xem" },
  { id: "qa_progress_editor", label: "QA – Cập nhật 4 mốc hoàn thành" },
  { id: "qa_manager", label: "Quản lý QA" },
  { id: "equipment_scheduler", label: "Bộ phận quản lý thiết bị – Xếp lịch thẩm định" },
  { id: "equipment_manager", label: "Quản lý bộ phận quản lý thiết bị" },
] as const;

export const QA_TIMELINE_FIELDS = [
  "actual_protocol_date", "status_protocol",
  "actual_validation_date", "status_validation",
  "actual_report_date", "status_report",
  "actual_vmp_date", "status_vmp",
] as const;
export const EQUIPMENT_TIMELINE_FIELDS = ["scheduled_at"] as const;
export const normalizePersonName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
```

- [ ] **Step 4: Chạy test và typecheck**

Run: `npm run test:unit && npm run typecheck`

Expected: PASS; năm mã đúng thứ tự, hai allowlist không giao nhau.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/features/itemPermissions/types.ts tests/unit/item-permission-contracts.test.mjs
git commit -m "test(phân quyền): khóa hợp đồng danh bạ và cột timeline"
```

---

### Task 2: Nâng `vmp_performers` thành danh bạ chuẩn ở chế độ preview

**Files:**
- Create: `supabase/migrations/20260810080000_danh_ba_phan_quyen_preview.sql`
- Create: `tests/sql/item-permissions.sql`
- Create: `scripts/test-item-permissions-sql.sh`

**Interfaces:**
- Consumes: `public.vmp_performers`, `profiles`, `vmp_plan_items`, `vmp_objects`, `system_config` hiện có.
- Produces: `vmp_normalize_person_name(text)`, các cột danh bạ chuẩn, `vmp_item_assignments`, `scheduled_at`, và cấu hình `item_permissions_mode`.

- [ ] **Step 1: Viết các assertion SQL trong transaction rollback**

```sql
select set_config('request.jwt.claims', json_build_object(
  'sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, true);

do $test$
begin
  if public.vmp_normalize_person_name('  Đặng   Thị Hồng Ngọc ') <> 'đặng thị hồng ngọc' then
    raise exception 'normalize name failed';
  end if;
  if (select value #>> '{}' from public.system_config where key='item_permissions_mode') <> 'preview' then
    raise exception 'mode must start in preview';
  end if;
  if exists (select 1 from public.vmp_active_item_assignments where user_id is null and grants_access) then
    raise exception 'unlinked assignment must not grant access';
  end if;
end $test$;
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `bash scripts/test-item-permissions-sql.sh`

Expected: FAIL vì hàm/bảng/cột chưa tồn tại.

- [ ] **Step 3: Viết migration schema**

Migration phải thực hiện chính xác các thay đổi sau:

```sql
create or replace function public.vmp_normalize_person_name(p_name text)
returns text language sql immutable parallel safe
as $$ select lower(regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g')) $$;

drop index if exists public.uq_performers_name;
alter table public.vmp_performers
  add column if not exists employee_code text,
  add column if not exists normalized_full_name text generated always as
    (public.vmp_normalize_person_name(performer_name)) stored,
  add column if not exists access_class text,
  add column if not exists scope_departments text[] not null default '{}',
  add column if not exists access_areas text[] not null default '{}',
  add column if not exists email_sent_confirmed boolean not null default false;

alter table public.vmp_performers add constraint vmp_performers_access_class_check
  check (access_class is null or access_class in (
    'view_only','qa_progress_editor','qa_manager','equipment_scheduler','equipment_manager'));
create unique index vmp_performers_employee_code_uniq
  on public.vmp_performers (lower(btrim(employee_code))) where nullif(btrim(employee_code),'') is not null;
create index vmp_performers_normalized_name_idx on public.vmp_performers (normalized_full_name);

alter table public.vmp_plan_items add column if not exists scheduled_at timestamptz;
update public.vmp_plan_items set scheduled_at = scheduled_date::timestamp at time zone 'Asia/Bangkok'
 where scheduled_at is null and scheduled_date is not null;

insert into public.system_config(key,value,description,category,is_sensitive)
values ('item_permissions_mode','"preview"'::jsonb,'Quyền theo hạng mục: preview hoặc enforced','permissions',true)
on conflict (key) do nothing;
```

`vmp_item_assignments` phải có `performer_id`, `user_id`, `validation_code`, `assignment_kind`, `source`, `source_text`, `expires_at`, `is_active`. Tạo view `vmp_active_item_assignments` tính `grants_access := user_id is not null and is_active and (expires_at is null or expires_at > now())` tại thời điểm đọc; không tạo generated column có `now()` vì biểu thức đó không immutable. Unique index dùng `(validation_code, performer_id, assignment_kind, source)`.

Script kiểm SQL phải giữ production không đổi:

```bash
#!/usr/bin/env bash
set -euo pipefail
set -a
source /home/admin1/VMP/.env.local
set +a
args=(-X -v ON_ERROR_STOP=1 -c 'begin')
for file in supabase/migrations/20260810*.sql; do args+=(-f "$file"); done
args+=(-f tests/sql/item-permissions.sql -c 'rollback')
psql "$SUPABASE_DB_URL" "${args[@]}"
```

- [ ] **Step 4: Kiểm migration bằng database tạm/transaction và rà quyền**

Run: `bash scripts/test-item-permissions-sql.sh`

Expected: migration đạt trong transaction kiểm thử, test đạt, toàn bộ DDL/fixture rollback và production chưa đổi.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810080000_danh_ba_phan_quyen_preview.sql tests/sql/item-permissions.sql scripts/test-item-permissions-sql.sh
git commit -m "feat(phân quyền): tạo danh bạ chuẩn và phân công preview"
```

---

### Task 3: RPC autocomplete, lưu danh bạ và nhập Excel

**Files:**
- Create: `supabase/migrations/20260810090000_rpc_danh_ba_va_phan_cong.sql`
- Modify: `tests/sql/item-permissions.sql`

**Interfaces:**
- Consumes: schema Task 2.
- Produces: `rpc_item_permission_directory(text)`, `rpc_upsert_item_permission_staff(uuid,jsonb,text)`, `rpc_import_item_permission_staff(jsonb,text)`.

- [ ] **Step 1: Thêm test tên duy nhất, tên trùng và mã nhân viên trùng**

```sql
select public.rpc_upsert_item_permission_staff(null, jsonb_build_object(
  'full_name','Đặng Thị Hồng Ngọc','department','rd','access_class','view_only',
  'scope_departments',jsonb_build_array('rd'),'access_areas',jsonb_build_array('*')
), 'Nhập thử');

do $test$
declare r jsonb;
begin
  r := public.rpc_item_permission_directory('Hồng Ngọc');
  if jsonb_array_length(r->'people') <> 1 then raise exception 'autocomplete must return one person'; end if;
end $test$;
```

Test khác chèn hai người cùng `normalized_full_name` nhưng khác email/bộ phận và xác nhận `match_status = 'ambiguous'`; cùng `employee_code` phải trả `ok=false`.

- [ ] **Step 2: Chạy SQL test để thấy fail ở RPC chưa có**

Run: `bash scripts/test-item-permissions-sql.sh`.

Expected: FAIL `function rpc_item_permission_directory does not exist`.

- [ ] **Step 3: Cài RPC với validation server**

`rpc_upsert_item_permission_staff` phải:

- chỉ Admin sửa mọi người;
- `qa_manager` chỉ sửa phân công QA, không được sửa danh tính/bộ phận người khác;
- kiểm bộ phận QA cho hai phân loại QA;
- kiểm mảng scope/area không rỗng khi người active;
- dùng `employee_code` nếu có, nếu không giữ nullable;
- nối `user_id` theo email duy nhất, không ghi đè liên kết đang thuộc người khác;
- ghi `audit_logs` với `change_reason` bắt buộc.

`rpc_item_permission_directory(p_query)` trả:

```json
{
  "ok": true,
  "people": [{
    "person_id": "uuid", "user_id": null, "employee_code": null,
    "full_name": "Đặng Thị Hồng Ngọc", "department": "rd",
    "email": "...", "account_status": "unlinked",
    "access_class": "view_only", "scope_departments": ["rd"],
    "access_areas": ["*"], "match_status": "unique"
  }]
}
```

- [ ] **Step 4: Rà quyền function và chạy lại test**

Run: `bash scripts/test-item-permissions-sql.sh`

Expected: PASS và truy vấn `has_function_privilege('anon', ..., 'EXECUTE')` đều `false`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810090000_rpc_danh_ba_va_phan_cong.sql tests/sql/item-permissions.sql
git commit -m "feat(phân quyền): thêm autocomplete và nhập danh bạ"
```

---

### Task 4: Phân công nguồn và phân công của quản lý

**Files:**
- Modify: `supabase/migrations/20260810090000_rpc_danh_ba_va_phan_cong.sql`
- Modify: `tests/sql/item-permissions.sql`

**Interfaces:**
- Consumes: `source_sheet_data->'values'->>17` (QA), `->>19` (nhân sự bộ phận khác), `vmp_objects.department`, danh bạ chuẩn.
- Produces: `rpc_refresh_source_item_assignments()`, `rpc_set_item_assignment(uuid,text,text,text,text)`, `rpc_item_assignments(text,uuid)`.

- [ ] **Step 1: Viết test nguồn tên và quyền quản lý**

Test fixture phải có ba người: QA manager, equipment manager của `xsx`, và nhân viên `xsx`; hai hạng mục `xsx/A1` và `qc/Hóa lý 1`. Assertion:

```sql
-- QA manager phân công qa được; equipment manager xsx phân công người xsx cho hạng mục xsx được.
-- equipment manager xsx phân công vào hạng mục qc phải trả ok=false.
-- chuỗi nguồn trùng tên tạo unresolved_reason='duplicate_name' và user_id null.
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `bash scripts/test-item-permissions-sql.sh`

Expected: FAIL vì ba RPC phân công chưa tồn tại.

- [ ] **Step 3: Viết logic refresh và phân công tay**

`rpc_refresh_source_item_assignments()` phải upsert hai nguồn mà không xoá phân công tay:

```sql
-- sheet_qa: source_sheet_data->'values'->>17, fallback owner_name
-- sheet_other_staff: source_sheet_data->'values'->>19
-- assignment_kind: qa / equipment_department
-- đối chiếu normalized_full_name; count=1 thì điền performer_id,user_id,
-- count=0 hoặc >1 thì giữ source_text, user_id null và unresolved_reason.
```

`rpc_set_item_assignment` nhận `p_person_id`, `p_validation_code`, `p_assignment_kind`, `p_action` (`assign`/`revoke`), `p_reason`; kiểm `qa_manager` và `equipment_manager` đúng phạm vi như đặc tả.

- [ ] **Step 4: Chạy test SQL và xác nhận phân công nguồn không bị phân công tay ghi đè**

Expected: bỏ `sheet_qa` vẫn còn dòng `qa_manager`; refresh nguồn không xóa dòng `equipment_manager`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810090000_rpc_danh_ba_va_phan_cong.sql tests/sql/item-permissions.sql
git commit -m "feat(phân quyền): nối phân công nguồn và quản lý"
```

---

### Task 5: Lõi quyền hiệu lực, giải thích và tiền kiểm bật áp dụng

**Files:**
- Create: `supabase/migrations/20260810100000_tinh_quyen_hieu_luc.sql`
- Modify: `tests/sql/item-permissions.sql`

**Interfaces:**
- Consumes: danh bạ, phân công, `vmp_objects.department/area/line`, `profiles.role` Admin.
- Produces: `vmp_item_rights(uuid,text)`, `vmp_can_view_item(uuid,text)`, `vmp_allowed_timeline_fields(uuid,text)`, `rpc_preview_item_rights(uuid,text)`, `rpc_item_permission_preflight()`, `rpc_set_item_permissions_mode(text,text)`.

- [ ] **Step 1: Viết bảng test ma trận quyền hai chiều**

```sql
-- view_only + assigned + đúng scope/area => can_view=true, editable_fields=[]
-- qa_progress_editor đúng cả ba => 8 trường QA
-- equipment_scheduler đúng department quản lý => ['scheduled_at']
-- assigned nhưng sai area => can_view=false
-- equipment_manager xsx không thấy đối tượng qc
-- admin => can_view=true nhưng phân loại Admin không lấy từ Excel
```

- [ ] **Step 2: Chạy để xác nhận fail**

Expected: FAIL ở `vmp_item_rights` chưa tồn tại.

- [ ] **Step 3: Cài một lõi SQL duy nhất**

Hàm trả một dòng có giao diện ổn định:

```sql
returns table (
  can_view boolean,
  editable_fields text[],
  view_reason text,
  assignment_sources text[],
  scope_match boolean,
  area_match boolean
)
```

`scope_match` so `scope_departments` với `vmp_objects.department` và chấp nhận `*`; `area_match` so cả `area` và `line` với `access_areas` và chấp nhận `*`. Nhân viên thường cần phân công active; manager dùng nhánh quản lý ở mục 4.3 của đặc tả.

- [ ] **Step 4: Cài preflight và công tắc có khóa**

`rpc_item_permission_preflight()` trả `blocking_errors[]` và `warnings[]`; `rpc_set_item_permissions_mode('enforced', reason)` chỉ Admin gọi được và từ chối nếu `blocking_errors` còn phần tử. Mọi lần đổi mode ghi `CONFIG_CHANGE` trong `audit_logs`.

Run SQL tests, expected PASS và fixture thiếu mã nhân viên vẫn không block.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810100000_tinh_quyen_hieu_luc.sql tests/sql/item-permissions.sql
git commit -m "feat(phân quyền): tính quyền hiệu lực và tiền kiểm"
```

---

### Task 6: Giới hạn từng cột timeline và giữ đủ ngày giờ

**Files:**
- Create: `supabase/migrations/20260810110000_quyen_tung_cot_timeline.sql`
- Modify: `n8n/wf-04-canonical-sync/parse-sheet-csv.js`
- Modify: `n8n/wf-04-canonical-sync/apply-canonical-snapshot.sql`
- Modify: `src/lib/supabaseData.ts`
- Modify: `tests/sql/item-permissions.sql`

**Interfaces:**
- Consumes: `vmp_allowed_timeline_fields`, `rpc_update_progress`, canonical Sheet column 27.
- Produces: `scheduled_at timestamptz`, parser `dd/mm/yyyy hh:mm:ss`, và server reject patch nguyên khối.

- [ ] **Step 1: Viết test patch QA/equipment/mixed**

```sql
-- QA patch actual_protocol_date + status_protocol => ok=true
-- QA patch scheduled_at => ok=false
-- equipment patch scheduled_at tương lai => ok=true
-- equipment patch scheduled_at + status_protocol => ok=false và không cột nào đổi
-- view_only patch bất kỳ => ok=false
```

Mỗi test ghi giá trị trước/sau để chứng minh transaction hỗn hợp không cập nhật một phần. Fixture chuyển `item_permissions_mode` sang `enforced` bên trong transaction kiểm thử sau khi preflight đạt; script rollback nên production vẫn ở `preview`.

- [ ] **Step 2: Chạy test để thấy luật hiện tại cho phép rộng hơn**

Expected: ít nhất case QA sửa `scheduled_at` hoặc equipment sửa QA field không bị chặn đúng như yêu cầu mới.

- [ ] **Step 3: Sửa `rpc_update_progress` theo mode**

Trong `preview`, giữ đường kiểm `ly_do_khong_sua_duoc` hiện tại. Trong `enforced`, lấy `vmp_allowed_timeline_fields(auth.uid(), p_validation_code)`, tính `bad_fields := jsonb_object_keys(p_patch) EXCEPT allowed`, và return `ok=false` trước câu `UPDATE` nếu có bất kỳ bad field. Allowlist áp sau khi chuẩn hóa `scheduled_date` cũ thành `scheduled_at`; không âm thầm bỏ trường.

- [ ] **Step 4: Chuyển đường lịch sang datetime**

```ts
const FORM_TO_COLUMN = {
  // ...
  lich_td: "scheduled_at",
};
```

Parser SQL dùng `to_timestamp(value, 'DD/MM/YYYY HH24:MI:SS') AT TIME ZONE 'Asia/Bangkok'`; nếu nguồn chỉ có ngày thì mặc định `00:00:00`. Vẫn cập nhật `scheduled_date = scheduled_at at time zone 'Asia/Bangkok'` cast date trong giai đoạn tương thích.

- [ ] **Step 5: Chạy SQL test, unit, typecheck rồi commit**

```bash
npm run test:unit && npm run typecheck
git add supabase/migrations/20260810110000_quyen_tung_cot_timeline.sql n8n/wf-04-canonical-sync/parse-sheet-csv.js n8n/wf-04-canonical-sync/apply-canonical-snapshot.sql src/lib/supabaseData.ts tests/sql/item-permissions.sql
git commit -m "feat(phân quyền): khóa từng cột timeline và giữ giờ lịch"
```

---

### Task 7: API TypeScript cho danh bạ, phân công và quyền dự kiến

**Files:**
- Create: `src/features/itemPermissions/api.ts`
- Modify: `src/features/itemPermissions/types.ts`
- Modify: `src/types/domain.ts`
- Modify: `tests/unit/item-permission-contracts.test.mjs`

**Interfaces:**
- Consumes: RPC Tasks 3–5.
- Produces: `searchPermissionDirectory`, `savePermissionPerson`, `importPermissionRows`, `fetchItemAssignments`, `setItemAssignment`, `fetchEffectiveRights`, `fetchPermissionPreflight`.

- [ ] **Step 1: Thêm test shape/decoder thất bại**

Test phải từ chối response thiếu `person_id`, `full_name`, `access_class`, `scope_departments`, `access_areas`; chấp nhận `employee_code=null` và `user_id=null`.

- [ ] **Step 2: Chạy unit test để thấy decoder chưa tồn tại**

Expected: FAIL import `decodeDirectoryPerson`.

- [ ] **Step 3: Viết type và decoder không dùng `as` mù**

```ts
export interface DirectoryPerson {
  person_id: string;
  user_id: string | null;
  employee_code: string | null;
  full_name: string;
  department: string;
  email: string | null;
  account_status: "linked" | "unlinked" | "inactive";
  access_class: AccessClass | null;
  scope_departments: string[];
  access_areas: string[];
}
```

Mọi wrapper dùng `supabase.rpc`, kiểm `error`, sau đó kiểm `ok === false` trước khi decode payload.

- [ ] **Step 4: Chạy unit + typecheck**

Run: `npm run test:unit && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/itemPermissions/api.ts src/features/itemPermissions/types.ts src/types/domain.ts tests/unit/item-permission-contracts.test.mjs
git commit -m "feat(phân quyền): thêm API danh bạ và quyền dự kiến"
```

---

### Task 8: Giao diện một danh bạ và autocomplete

**Files:**
- Create: `src/features/itemPermissions/StaffDirectoryPanel.tsx`
- Create: `src/features/itemPermissions/AssignmentPanel.tsx`
- Create: `src/features/itemPermissions/EffectiveRightsPanel.tsx`
- Modify: `src/pages/PhanQuyenPage.tsx`
- Modify: `src/index.css`
- Create: `tests/e2e/danh-ba-phan-quyen.mjs`
- Modify: `tests/e2e/ma-tran-phan-quyen.mjs`

**Interfaces:**
- Consumes: API Task 7 và màn phân quyền hiện có.
- Produces: khu “Danh bạ nhân sự & quyền” làm nguồn duy nhất cho mọi ô chọn người.

- [ ] **Step 1: Viết E2E mock trước**

Mock các endpoint `/rest/v1/rpc/rpc_item_permission_directory`, `/rpc_upsert_item_permission_staff`, `/rpc_item_assignments`, `/rpc_preview_item_rights`, `/rpc_item_permission_preflight`. Test nhập `Hồng`, chọn dòng “Đặng Thị Hồng Ngọc · RD”, rồi assert bộ phận/email/phân loại/phạm vi/khu vực tự điền và request lưu chứa `person_id`, không chứa tên tự do.

- [ ] **Step 2: Chạy E2E để thấy fail vì chưa có panel**

Run: `node tests/e2e/danh-ba-phan-quyen.mjs`

Expected: FAIL không tìm thấy heading `Danh bạ nhân sự & quyền`.

- [ ] **Step 3: Tạo ba panel nhỏ và ghép vào trang**

`StaffDirectoryPanel` có:

- ô combobox tìm tên/tài khoản, debounce 250 ms;
- kết quả kèm bộ phận/email để phân biệt trùng tên;
- chọn người tự điền dữ liệu và khóa `person_id`;
- multi-select phạm vi/khu vực;
- badge `Đã nối tài khoản`, `Chưa có tài khoản`, `Trùng tên — cần nối tay`;
- banner `DỰ THẢO — CHƯA ÁP DỤNG QUYỀN THẬT` lấy từ preflight/mode.

`AssignmentPanel` không có ô tên tự do: chỉ nhận `DirectoryPerson`. `EffectiveRightsPanel` có hai view “Theo nhân viên” và “Theo hạng mục”, hiện `view_reason` và từng cột được sửa.

- [ ] **Step 4: Chạy E2E cũ và mới**

Run: `node tests/e2e/danh-ba-phan-quyen.mjs && node tests/e2e/ma-tran-phan-quyen.mjs && npm run typecheck`

Expected: PASS; ma trận vai trò hiện có không hồi quy.

- [ ] **Step 5: Commit**

```bash
git add src/features/itemPermissions src/pages/PhanQuyenPage.tsx src/index.css tests/e2e/danh-ba-phan-quyen.mjs tests/e2e/ma-tran-phan-quyen.mjs
git commit -m "feat(phân quyền): hiển thị danh bạ và quyền theo hạng mục"
```

---

### Task 9: File Excel chuẩn và importer preview

**Files:**
- Create: `scripts/permission-workbook.mjs`
- Create: `src/features/itemPermissions/permissionWorkbook.ts`
- Create: `tests/unit/permission-workbook.test.mjs`
- Create: `public/templates/phan-quyen-vmp.xlsx`
- Modify: `src/features/itemPermissions/StaffDirectoryPanel.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: workbook người dùng với chín cột.
- Produces: workbook tải xuống, parser browser và payload `rpc_import_item_permission_staff`.

- [ ] **Step 1: Viết unit test workbook**

Test tạo workbook vào thư mục tạm, đọc lại bằng SheetJS và assert:

```js
assert.deepEqual(workbook.SheetNames, ["Trang tính1", "Hướng dẫn"]);
assert.equal(headers.length, 9);
assert.match(classificationValidation.formula1, /QA – Cập nhật 4 mốc hoàn thành/);
assert.match(guideText, /Mã nhân viên.*không bắt buộc/s);
assert.match(guideText, /dấu chấm phẩy/s);
```

- [ ] **Step 2: Chạy test để thấy fail**

Run: `node --test tests/unit/permission-workbook.test.mjs`

Expected: FAIL vì generator chưa có.

- [ ] **Step 3: Viết generator và parser chín cột**

Thêm thư viện chỉ dùng lúc sinh file:

```bash
npm install --save-dev exceljs@4.4.0
```

Generator giữ nguyên tiêu đề: `STT`, `Bộ phận`, `Mã nhân viên`, `Họ và tên`, `Phân loại`, `Phạm vi`, `Khu vực phân quyền`, `Email nhận tài khoản`, `Xác nhận gửi email`. Sheet `Hướng dẫn` giải thích năm phân loại và ví dụ `QA;QC`, `A1;A2`; không macro.

Parser trả lỗi theo `rowNumber` và không gọi RPC nếu có mã khu vực/phân loại lạ. Mã nhân viên trống vẫn hợp lệ.

- [ ] **Step 4: Sinh file và kiểm import preview trên UI**

Run:

```bash
node scripts/permission-workbook.mjs public/templates/phan-quyen-vmp.xlsx
node --test tests/unit/permission-workbook.test.mjs
npm run typecheck
```

Expected: PASS và nút tải file trỏ `/naniVMP/templates/phan-quyen-vmp.xlsx` qua base URL Vite.

- [ ] **Step 5: Commit**

```bash
git add scripts/permission-workbook.mjs src/features/itemPermissions/permissionWorkbook.ts src/features/itemPermissions/StaffDirectoryPanel.tsx tests/unit/permission-workbook.test.mjs public/templates/phan-quyen-vmp.xlsx package.json package-lock.json
git commit -m "feat(phân quyền): thêm file Excel và nhập danh bạ preview"
```

---

### Task 10: UI timeline phản ánh quyền từng cột

**Files:**
- Modify: `src/components/dashboard/ProgressEditModal.tsx`
- Modify: `src/lib/supabaseData.ts`
- Create: `tests/e2e/quyen-cot-timeline.mjs`

**Interfaces:**
- Consumes: `editable_fields` từ `rpc_preview_item_rights`/quyền hiệu lực.
- Produces: khi `enforced`, QA chỉ thao tác bốn mốc, equipment chỉ thao tác `datetime-local`, view-only không có nút lưu tiến độ; khi `preview`, modal giữ hành vi hiện tại và chỉ hiện quyền dự kiến ở panel.

- [ ] **Step 1: Viết E2E ba persona**

Case `enforced`: QA có tám control QA enabled và lịch disabled; equipment có lịch enabled và tám control QA disabled; view-only bị khóa tất cả và có lý do “Chỉ xem”. Case `preview`: control vẫn theo luật đang chạy, banner ghi rõ quyền dự kiến chưa áp dụng. Mock request hỗn hợp và assert UI không gửi ở `enforced`.

- [ ] **Step 2: Chạy test để thấy fail**

Run: `node tests/e2e/quyen-cot-timeline.mjs`

Expected: FAIL vì modal chưa nhận `editableFields`.

- [ ] **Step 3: Thêm prop và khóa theo tên cột DB**

```ts
editableFields?: readonly string[];
permissionMode?: "preview" | "enforced";
```

Mỗi block ngày/trạng thái chỉ kiểm allowlist khi `permissionMode === "enforced"`. Lịch dùng:

```tsx
<input type="datetime-local" value={f.lich_td}
  disabled={permissionMode === "enforced" && !canEdit("scheduled_at")} />
```

Giá trị hiển thị/submit được chuyển giữa `Asia/Bangkok` và ISO mà không dịch sai giờ.

- [ ] **Step 4: Chạy E2E, typecheck và build**

Run: `node tests/e2e/quyen-cot-timeline.mjs && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ProgressEditModal.tsx src/lib/supabaseData.ts tests/e2e/quyen-cot-timeline.mjs
git commit -m "feat(phân quyền): khóa giao diện theo từng cột timeline"
```

---

### Task 11: RLS/RPC đọc chống lộ dữ liệu khi enforced

**Files:**
- Create: `supabase/migrations/20260810120000_rls_doc_theo_hang_muc.sql`
- Create: `scripts/audit-item-permission-rpcs.sql`
- Modify: `tests/sql/item-permissions.sql`

**Interfaces:**
- Consumes: `vmp_can_view_item(auth.uid(), validation_code)` và mode preview/enforced.
- Produces: policy `vmp_plan_items_select_item_permissions`, helper `vmp_visible_plan_items()`, audit blocker cho mọi SECURITY DEFINER RPC đọc.

- [ ] **Step 1: Viết test chống lộ count/list**

Với hai người ở hai area khác nhau, test trực tiếp table và các RPC đọc người dùng: `rpc_get_vmp_dashboard`, `rpc_dashboard_kpi`, `rpc_due_alerts`, `rpc_alert_context`, `rpc_get_missing_items`, `rpc_source_warnings`, `rpc_active_rules`, `rpc_trang_thai_he_thong`, cùng họ `rpc_ai_*`. Mỗi response không được chứa mã/tổng số hạng mục area còn lại.

- [ ] **Step 2: Chạy audit để lấy danh sách function chưa dùng lõi quyền**

```sql
select p.oid::regprocedure
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and pg_get_functiondef(p.oid) ilike '%vmp_plan_items%'
  and p.proname not in ('audit_plan_item_changes','audit_plan_item_changes_v2')
  and pg_get_functiondef(p.oid) not ilike '%vmp_can_view_item%'
  and pg_get_functiondef(p.oid) not ilike '%vmp_visible_plan_items%';
```

Expected trước migration: có các RPC dashboard/AI/cảnh báo; sau migration: không còn RPC đọc người dùng trong danh sách. RPC ghi/sync/service được allowlist rõ trong script và không tính là đường đọc trình duyệt.

- [ ] **Step 3: Cài policy có nhánh preview bảo toàn hành vi hiện tại**

Policy dùng:

```sql
public.item_permissions_mode() = 'preview'
or public.vmp_can_view_item(auth.uid(), validation_code)
or public.is_admin()
```

Các SECURITY DEFINER RPC đọc nêu ở Step 1 phải thêm cùng predicate vào CTE nguồn. Không tin RLS tự lọc vì function owner có thể bypass RLS.

- [ ] **Step 4: Gắn audit vào preflight**

`rpc_item_permission_preflight()` thêm blocking error `UNFILTERED_SECURITY_DEFINER_RPC` với danh sách signature nếu script audit còn trả hàng. Vì vậy Admin không thể bật `enforced` khi còn một đường tổng hợp làm lộ count.

Run SQL tests ở cả `preview` và transaction tạm chuyển `enforced`; rollback cuối test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810120000_rls_doc_theo_hang_muc.sql scripts/audit-item-permission-rpcs.sql tests/sql/item-permissions.sql
git commit -m "feat(phân quyền): lọc mọi đường đọc theo hạng mục"
```

---

### Task 12: Nghiệm thu preview, deploy và giữ enforced tắt

**Files:**
- Modify: `package.json`
- Modify: `tests/e2e/README.md`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: toàn bộ Tasks 1–11.
- Produces: bản online preview đã kiểm, workbook tải được, migration production đã áp nhưng mode vẫn `preview`.

- [ ] **Step 1: Thêm lệnh kiểm đầy đủ**

```json
"test:permissions": "npm run test:unit && node tests/e2e/danh-ba-phan-quyen.mjs && node tests/e2e/quyen-cot-timeline.mjs && node tests/e2e/ma-tran-phan-quyen.mjs"
```

- [ ] **Step 2: Chạy verification cục bộ**

Run:

```bash
npm run test:permissions
npm run typecheck
npm run build
git diff --check
```

Expected: tất cả exit 0.

- [ ] **Step 3: Áp migration production theo thứ tự và hậu kiểm mode**

```bash
set -a; source /home/admin1/VMP/.env.local; set +a
for f in \
  supabase/migrations/20260810080000_danh_ba_phan_quyen_preview.sql \
  supabase/migrations/20260810090000_rpc_danh_ba_va_phan_cong.sql \
  supabase/migrations/20260810100000_tinh_quyen_hieu_luc.sql \
  supabase/migrations/20260810110000_quyen_tung_cot_timeline.sql \
  supabase/migrations/20260810120000_rls_doc_theo_hang_muc.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$f"
done
psql "$SUPABASE_DB_URL" -X -Atc "select value #>> '{}' from system_config where key='item_permissions_mode'"
```

Expected: dòng cuối chính xác `preview`.

- [ ] **Step 4: Push, chờ GitHub Pages và kiểm online**

```bash
git push origin main
gh run watch "$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
curl -fsSL https://tienhoandhd-droid.github.io/naniVMP/ | rg "Danh bạ nhân sự"
curl -fsSI https://tienhoandhd-droid.github.io/naniVMP/templates/phan-quyen-vmp.xlsx | rg "200"
```

Đăng nhập online bằng Admin, kiểm autocomplete, import một dòng preview, quyền dự kiến và audit; không bấm bật `enforced`.

- [ ] **Step 5: Ghi handover và commit cuối**

`docs/HANDOVER.md` phải ghi commit deploy, năm migration đã áp, kết quả preflight, mode `preview`, link workbook và cảnh báo “chưa áp dụng quyền thật”.

```bash
git add package.json tests/e2e/README.md docs/HANDOVER.md
git commit -m "docs(phân quyền): nghiệm thu bản preview online"
git push origin main
```

---

## Self-Review Record

- Spec sections 1–7: Tasks 1, 3, 4, 5 và 6.
- Spec section 8 (`scheduled_at`): Task 6 và Task 10.
- Spec sections 9–11 (data/RLS/RPC): Tasks 2, 5, 6 và 11.
- Spec sections 12–13 (UI/Excel): Tasks 8–10.
- Spec sections 14–16 (error/safety/tests): SQL tests trong Tasks 2–6/11 và E2E Tasks 8/10/12.
- Spec section 17 (completion): Task 12; production vẫn ở preview đúng tiêu chí.
- Spec section 18 (outside scope): không email tự động, không macro, không kiêm nhiều phân loại, không đổi service role/n8n access.
- Type consistency checked: `person_id`, `user_id`, `access_class`, `scope_departments`, `access_areas`, `scheduled_at`, `editable_fields` dùng thống nhất từ SQL tới TypeScript.
- Placeholder scan completed: mọi bước đều có file, lệnh chạy, kết quả mong đợi và nội dung triển khai cụ thể.
