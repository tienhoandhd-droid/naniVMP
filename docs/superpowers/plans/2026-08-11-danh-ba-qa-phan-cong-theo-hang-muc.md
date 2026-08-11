# Danh bạ QA và phân quyền theo từng hạng mục Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách danh bạ QA khỏi phạm vi địa lý, chỉ cấp quyền xem/sửa cho QA đã được Admin nối tài khoản và được Quản lý QA phân công trực tiếp vào từng hạng mục.

**Architecture:** `vmp_performers.id` tiếp tục là `person_id` ổn định; `user_id` chỉ được nối bằng thao tác Admin riêng, không tự nối khi lưu email. `vmp_item_assignments` nhận thêm vai trò QA `primary`/`collaborator`; lõi `vmp_item_rights` kiểm phân công theo `person_id` cho QA và giữ kiểm phạm vi hiện hành cho vai trò thiết bị. Frontend ẩn hoàn toàn phạm vi đối với phân loại QA, thêm khối nối tài khoản Admin và cho Quản lý QA quản lý nhiều QA trên một hạng mục.

**Tech Stack:** PostgreSQL 17/Supabase RLS + PL/pgSQL, React 18, TypeScript, Vite, Node test runner, Puppeteer, ExcelJS.

## Global Constraints

- Mỗi người có đúng một `person_id`; tên, email và mã nhân viên không phải khóa phân công.
- QA không có phạm vi bộ phận/xưởng/khu vực/line; vai trò ngoài QA vẫn giữ phạm vi khi nghiệp vụ cần.
- Chỉ Admin nối/ngắt `user_id`, cấp phân loại và khóa/mở hồ sơ.
- Quản lý QA chỉ thêm, đổi vai trò hoặc thu hồi phân công QA; QA không tự nhận/chuyển việc.
- QA chưa nối tài khoản hoặc chưa được phân công không đọc được hạng mục.
- Một hạng mục có tối đa một QA `primary` và nhiều QA `collaborator`; hai loại có cùng tám trường sửa QA.
- Mọi mutation bắt buộc lý do, audit, kiểm quyền server và transaction nguyên tử.
- Giữ `item_permissions_mode = preview`; không tự bật `enforced` và không triển khai production khi chưa có phê duyệt riêng.
- Không triển khai riêng migration `20260810160000_pham_vi_xuong_khu_vuc_line_va_person_id.sql`; migration mới phải được kiểm cùng migration này trong một transaction để trạng thái cuối không bắt phạm vi QA.

---

## File map

- Create `supabase/migrations/20260811100000_qa_theo_phan_cong_hang_muc.sql`: lớp forward-only sửa hợp đồng QA sau migration phạm vi, thêm vai trò phân công, RPC nối tài khoản và override lõi quyền/preflight.
- Create `src/features/itemPermissions/AccountLinkPanel.tsx`: UI Admin tìm tài khoản chưa nhận chủ, nối/ngắt tài khoản và tải lại hồ sơ.
- Modify `src/features/itemPermissions/types.ts`: kiểu tài khoản ứng viên, `QaAssignmentRole`, helper phân biệt hồ sơ QA và điều kiện hoàn chỉnh theo phân loại.
- Modify `src/features/itemPermissions/api.ts`: decoder/API tài khoản, hợp đồng `assignment_role`, tham số RPC phân công mới.
- Modify `src/features/itemPermissions/StaffDirectoryPanel.tsx`: QA không tải/hiện/bắt buộc phạm vi; phát sự kiện sau lưu/nối.
- Modify `src/features/itemPermissions/AssignmentPanel.tsx`: chọn QA chính/phối hợp, liệt kê nhiều QA, thu hồi/đổi vai trò.
- Modify `src/features/itemPermissions/EffectiveRightsPanel.tsx`: hiển thị “khớp phân công” cho QA thay vì bốn tầng phạm vi.
- Modify `src/pages/PhanQuyenPage.tsx`: Admin sửa/nối tài khoản; Admin và Quản lý QA phân công QA; quản lý thiết bị giữ workspace riêng.
- Modify `src/features/itemPermissions/permissionWorkbook.ts`, `scripts/permission-workbook.mjs`, `public/templates/phan-quyen-vmp.xlsx`: dòng QA được để trống bốn cột phạm vi; dòng ngoài QA vẫn kiểm hierarchy.
- Modify `scripts/test-item-permissions-sql.sh`: chạy cả migration ngày 10 và 11/08 theo thứ tự trong transaction rollback.
- Modify `tests/sql/item-permissions.sql`: test database cho nối tài khoản, nhiều QA, quyền theo phân công và fail-closed.
- Modify `tests/unit/item-permission-contracts.test.mjs`, `tests/unit/permission-workbook.test.mjs`: test hợp đồng TypeScript/import.
- Modify `tests/e2e/danh-ba-phan-quyen.mjs`: test giao diện QA không gọi catalog, Admin nối tài khoản và Quản lý QA phân công nhiều người.
- Modify `docs/HANDOVER.md`: cập nhật mô hình vận hành và thứ tự migration, không ghi rằng production đã triển khai khi chưa triển khai thật.

---

### Task 1: Chốt hợp đồng domain QA không có phạm vi

**Files:**
- Modify: `src/features/itemPermissions/types.ts`
- Modify: `tests/unit/item-permission-contracts.test.mjs`

**Interfaces:**
- Produces: `QaAssignmentRole = "primary" | "collaborator"`.
- Produces: `isQaAccessClass(accessClass: AccessClass | null): boolean`.
- Produces: `requiresHierarchyScope(accessClass: AccessClass | null): boolean`.
- Produces: `isDirectoryPersonComplete(person: DirectoryPerson): boolean` với QA chỉ cần bộ phận + phân loại, vai trò ngoài QA cần đủ bốn tầng.
- Produces: `ItemAssignment.assignment_role: QaAssignmentRole | null`.

- [ ] **Step 1: Viết test fail cho điều kiện hoàn chỉnh theo phân loại**

Thêm các assertion cụ thể:

```js
const qa = {
  ...complete,
  department: "qa",
  access_class: "qa_progress_editor",
  scope_departments: [],
  scope_factory_ids: [],
  scope_area_ids: [],
  scope_line_ids: [],
};
assert.equal(isQaAccessClass(qa.access_class), true);
assert.equal(requiresHierarchyScope(qa.access_class), false);
assert.equal(isDirectoryPersonComplete(qa), true);
assert.equal(isDirectoryPersonComplete({ ...qa, department: "rd" }), false);

const equipment = { ...complete, access_class: "equipment_scheduler" };
assert.equal(requiresHierarchyScope(equipment.access_class), true);
assert.equal(isDirectoryPersonComplete({ ...equipment, scope_line_ids: [] }), false);
```

Thêm decoder assignment với `assignment_role: "primary"`, và test từ chối `assignment_role: "owner"`.

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `node --import tsx --test tests/unit/item-permission-contracts.test.mjs`  
Expected: FAIL vì helper/field mới chưa tồn tại và QA không phạm vi còn bị coi là thiếu.

- [ ] **Step 3: Cài đặt helper và kiểu tối thiểu**

Trong `types.ts`:

```ts
export type QaAssignmentRole = "primary" | "collaborator";

export function isQaAccessClass(value: AccessClass | null): boolean {
  return value === "qa_progress_editor" || value === "qa_manager";
}

export function requiresHierarchyScope(value: AccessClass | null): boolean {
  return value !== null && !isQaAccessClass(value);
}

export function isDirectoryPersonComplete(person: DirectoryPerson): boolean {
  if (!person.department?.trim() || !person.access_class) return false;
  if (isQaAccessClass(person.access_class)) {
    return person.department === "qa";
  }
  return Boolean(
    person.scope_departments.length
    && person.scope_factory_ids.length
    && person.scope_area_ids.length
    && person.scope_line_ids.length
  );
}
```

Thêm `assignment_role: QaAssignmentRole | null` vào `ItemAssignment`.

- [ ] **Step 4: Chạy test unit liên quan**

Run: `node --import tsx --test tests/unit/item-permission-contracts.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/itemPermissions/types.ts tests/unit/item-permission-contracts.test.mjs
git commit -m "refactor(phân quyền): tách QA khỏi phạm vi địa lý"
```

---

### Task 2: Sửa file Excel để QA không cần bốn tầng phạm vi

**Files:**
- Modify: `src/features/itemPermissions/permissionWorkbook.ts`
- Modify: `scripts/permission-workbook.mjs`
- Modify: `tests/unit/permission-workbook.test.mjs`
- Regenerate: `public/templates/phan-quyen-vmp.xlsx`

**Interfaces:**
- Consumes: `isQaAccessClass()` từ Task 1.
- Produces: `parsePermissionRows()` trả bốn mảng phạm vi rỗng cho QA; dòng ngoài QA vẫn resolve mã hierarchy như cũ.

- [ ] **Step 1: Viết test fail cho dòng QA để trống phạm vi**

```js
const qaWithoutScope = parsePermissionRows([
  PERMISSION_HEADERS,
  [1, "QA", "NV01", "Nguyễn Văn A", "QA – Cập nhật 4 mốc hoàn thành",
    "", "", "", "", "a@vmp.local", "Có"],
], { scopeCatalog });
assert.deepEqual(qaWithoutScope.errors, []);
assert.deepEqual(qaWithoutScope.rows[0].scope_departments, []);
assert.deepEqual(qaWithoutScope.rows[0].scope_factory_ids, []);
assert.deepEqual(qaWithoutScope.rows[0].scope_area_ids, []);
assert.deepEqual(qaWithoutScope.rows[0].scope_line_ids, []);
```

Giữ test `equipment_scheduler` thiếu phạm vi phải báo đủ bốn lỗi. Sửa test workbook để hướng dẫn chứa câu “QA để trống bốn cột phạm vi”.

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `node --import tsx --test tests/unit/permission-workbook.test.mjs`  
Expected: FAIL với “Phạm vi ... không được để trống”.

- [ ] **Step 3: Cài đặt parser phân nhánh theo phân loại**

```ts
const qaWithoutHierarchy = accessClass ? isQaAccessClass(accessClass) : false;
let resolved: ScopeResolution = {
  ok: true,
  selection: { departments: [], factories: [], areas: [], lines: [] },
};
if (!qaWithoutHierarchy) {
  for (const [scopeKey, label] of scopeLabels) {
    if (!scopeCodes[scopeKey].length) rowErrors.push(`Phạm vi ${label} không được để trống`);
  }
  resolved = resolveScopeCodes(options.scopeCatalog, scopeCodes);
  if (!resolved.ok) rowErrors.push(resolved.error);
}
```

Trong script sinh workbook, giữ 11 cột để tương thích nhưng đổi hướng dẫn:

```js
"Nhân sự QA để trống bốn cột phạm vi; quyền QA phát sinh từ phân công từng hạng mục.",
"Các phân loại ngoài QA vẫn phải nhập đủ bộ phận, xưởng, khu vực và line.",
"Email chỉ dùng nhận diện ứng viên; Admin phải nối tài khoản trên web trước khi quyền có hiệu lực.",
```

- [ ] **Step 4: Chạy test và sinh lại file mẫu**

Run: `node --import tsx --test tests/unit/permission-workbook.test.mjs`  
Expected: PASS.

Run: `npm run gen:permission-workbook`  
Expected: cập nhật `public/templates/phan-quyen-vmp.xlsx` thành công.

- [ ] **Step 5: Chạy lại test workbook trên file sinh**

Run: `node --import tsx --test tests/unit/permission-workbook.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/itemPermissions/permissionWorkbook.ts scripts/permission-workbook.mjs \
  tests/unit/permission-workbook.test.mjs public/templates/phan-quyen-vmp.xlsx
git commit -m "feat(danh bạ): bỏ phạm vi bắt buộc cho QA"
```

---

### Task 3: Thêm migration nối tài khoản Admin và nới tiền kiểm QA

**Files:**
- Create: `supabase/migrations/20260811100000_qa_theo_phan_cong_hang_muc.sql`
- Modify: `scripts/test-item-permissions-sql.sh`
- Modify: `tests/sql/item-permissions.sql`

**Interfaces:**
- Produces RPC `rpc_item_permission_account_candidates(p_query text default null) returns jsonb`.
- Produces RPC `rpc_link_item_permission_account(p_person_id uuid, p_user_id uuid, p_reason text, p_expected_version integer) returns jsonb`; `p_user_id = null` nghĩa là gỡ nối.
- Overrides `rpc_upsert_item_permission_staff(uuid,jsonb,text,integer)` để lưu email không tự đổi `user_id` và QA cho phép scope rỗng.
- Overrides `rpc_import_item_permission_staff(jsonb,text)` qua cùng upsert.
- Overrides `rpc_item_permission_directory(text)` để tiếp tục trả `version`/`account_status` sau nối.
- Overrides `rpc_item_permission_preflight()` để QA không nhận `INCOMPLETE_ACTIVE_PERSON` chỉ vì scope rỗng.

- [ ] **Step 1: Mở rộng SQL harness để nhận migration ngày 11/08**

Đổi glob thành danh sách đã sort:

```bash
migrations=(
  "$repo_dir"/supabase/migrations/20260810*.sql
  "$repo_dir"/supabase/migrations/20260811*.sql
)
IFS=$'\n' migrations=($(printf '%s\n' "${migrations[@]}" | sort))
unset IFS
```

- [ ] **Step 2: Viết SQL test fail cho lưu QA và nối tài khoản rõ ràng**

Trong fixture Admin, tạo một QA scope rỗng và một profile QA chưa có chủ. Assert:

```sql
v_result := public.rpc_upsert_item_permission_staff(
  null,
  jsonb_build_object(
    'full_name', 'E2E QA Không Phạm Vi',
    'department', 'qa',
    'access_class', 'qa_progress_editor',
    'email', 'qa-no-scope@vmp.local',
    'scope_departments', '[]'::jsonb,
    'scope_factory_ids', '[]'::jsonb,
    'scope_area_ids', '[]'::jsonb,
    'scope_line_ids', '[]'::jsonb,
    'is_active', true
  ),
  'Tạo QA chưa nối tài khoản',
  0
);
if coalesce((v_result->>'ok')::boolean, false) is not true
    or v_result->>'user_id' is not null then
  raise exception 'Lưu QA phải chấp nhận scope rỗng và không tự nối email: %', v_result;
end if;
```

Sau đó assert người không phải Admin gọi link bị `FORBIDDEN`; Admin nối thành công; tài khoản đã nối người khác bị `ACCOUNT_ALREADY_LINKED`; hồ sơ đang nối không được đổi bộ phận/phân loại trước khi gỡ (`ACCOUNT_RELINK_REQUIRED`); gỡ nối đồng bộ `vmp_item_assignments.user_id = null`, `unresolved_reason = 'account_unlinked'`; Quản lý QA bị gỡ nối được hạ coarse role từ `qa_manager` về `viewer` và không gọi được RPC quản lý; audit có lý do người dùng nhập.

- [ ] **Step 3: Chạy SQL harness để xác nhận thất bại**

Run: `bash scripts/test-item-permissions-sql.sh`  
Expected: FAIL vì migration/RPC mới chưa tồn tại hoặc QA scope rỗng bị `INVALID_SCOPE_HIERARCHY`.

- [ ] **Step 4: Tạo migration account-link và upsert QA**

Migration phải giữ forward-only sau `20260810160000`. Logic lưu scope:

```sql
v_requires_scope := v_access_class not in ('qa_progress_editor', 'qa_manager');
if v_is_active and v_requires_scope and not public.vmp_valid_permission_scope(
  v_departments, v_factories, v_areas, v_lines
) then
  return jsonb_build_object('ok', false, 'error_code', 'INVALID_SCOPE_HIERARCHY',
    'error', 'Phạm vi phải có đủ đường bộ phận → xưởng → khu vực → line đang hoạt động');
end if;
if not v_requires_scope then
  v_departments := '{}'::text[];
  v_factories := '{}'::uuid[];
  v_areas := '{}'::uuid[];
  v_lines := '{}'::uuid[];
  v_legacy_areas := '{}'::text[];
end if;
```

Upsert hồ sơ phải bảo toàn `v_old.user_id` và không SELECT profile theo email:

```sql
v_user_id := case when v_person_id is null then null else v_old.user_id end;
```

Nếu hồ sơ đang nối và patch đổi `department` hoặc `access_class`, trả `ACCOUNT_RELINK_REQUIRED`; Admin phải gỡ nối, sửa hồ sơ rồi nối lại để coarse role/profile và access class không lệch nhau.

RPC nối tài khoản phải lock performer, profile và kiểm version:

```sql
select * into v_person from public.vmp_performers
where id = p_person_id for update;
if p_expected_version is distinct from v_person.version then
  return jsonb_build_object('ok', false, 'error_code', 'VERSION_CONFLICT',
    'error', 'Hồ sơ đã được cập nhật ở phiên khác',
    'current_version', v_person.version);
end if;
```

Khi `p_user_id` không null, profile phải hoạt động, chưa nối người khác, và:

```sql
if v_person.access_class in ('qa_progress_editor', 'qa_manager')
   and v_profile.department is not null
   and v_profile.department <> 'qa' then
  return jsonb_build_object('ok', false, 'error_code', 'INVALID_QA_PRINCIPAL',
    'error', 'Tài khoản QA phải thuộc bộ phận QA');
end if;
if v_profile.role::text <> 'admin' then
  update public.profiles
  set role = case when v_person.access_class = 'qa_manager'
                  then 'qa_manager'::public.user_role
                  else 'viewer'::public.user_role end,
      department = 'qa'
  where id = p_user_id;
end if;
```

Nếu profile QA chưa có `department`, RPC đặt `profiles.department = 'qa'`; profile đang thuộc bộ phận khác bị từ chối để tránh nối nhầm người. Với tài khoản không phải Admin, liên kết `qa_manager` đặt coarse role `qa_manager`, còn `qa_progress_editor` đặt coarse role `viewer`; chính `access_class` và phân công mới cấp tám trường sửa. Khi gỡ liên kết Quản lý QA, RPC hạ coarse role `qa_manager` về `viewer` trong cùng transaction để tài khoản không giữ đường quản trị sau khi mất `person_id`. Tài khoản Admin không bị hạ vai bởi thao tác danh bạ.

Sau đó update performer `user_id`, tăng `version`; update mọi assignment cùng `performer_id`; ghi audit old/new của cả profile/performer; trả `person_id`, `user_id`, `version`, `account_status`.

RPC candidate chỉ Admin/service role được gọi và trả:

```json
{
  "user_id": "uuid",
  "email": "qa@vmp.local",
  "full_name": "Nguyễn Văn A",
  "role": "viewer",
  "department": "qa",
  "is_active": true,
  "linked_person_id": null
}
```

Thu `PUBLIC`/`anon`, chỉ grant `authenticated`; không grant browser gọi helper nhận `p_uid` tùy ý.

- [ ] **Step 5: Override preflight đúng theo phân loại**

Điều kiện thiếu scope chỉ áp ngoài QA:

```sql
or (
  person.access_class not in ('qa_progress_editor', 'qa_manager')
  and (
    cardinality(person.scope_departments) = 0
    or cardinality(person.scope_factory_ids) = 0
    or cardinality(person.scope_area_ids) = 0
    or cardinality(person.scope_line_ids) = 0
  )
)
```

Thêm lỗi `ASSIGNMENT_PERSON_INACTIVE`, `ASSIGNMENT_ACCOUNT_MISMATCH`; giữ toàn bộ lỗi security/source-resolution hiện có bằng cách override đầy đủ, không xóa các nhánh đã có. Lỗi trùng QA chính được thêm ở Task 4 sau khi cột `assignment_role` tồn tại.

- [ ] **Step 6: Chạy SQL harness**

Run: `bash scripts/test-item-permissions-sql.sh`  
Expected: PASS và cuối lệnh `ROLLBACK`, không thay đổi production.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260811100000_qa_theo_phan_cong_hang_muc.sql \
  scripts/test-item-permissions-sql.sh tests/sql/item-permissions.sql
git commit -m "feat(phân quyền): nối tài khoản QA bằng xác nhận Admin"
```

---

### Task 4: Thêm QA chính/phối hợp và lõi quyền assignment-only

**Files:**
- Modify: `supabase/migrations/20260811100000_qa_theo_phan_cong_hang_muc.sql`
- Modify: `tests/sql/item-permissions.sql`

**Interfaces:**
- Extends: `vmp_item_assignments.assignment_role text null` (`primary`, `collaborator`; null cho `equipment_department`).
- Replaces RPC signature with `rpc_set_item_assignment(p_person_id uuid, p_validation_code text, p_assignment_kind text, p_assignment_role text, p_action text, p_reason text)`.
- `rpc_item_assignments()` returns `assignment_role`.
- `vmp_item_rights(uid, validation_code)` uses assignment by `performer_id` for QA and ignores QA scope.

- [ ] **Step 1: Viết SQL test fail cho nhiều QA và một QA chính**

Tạo hai QA đã nối và một hạng mục. Gọi:

```sql
v_result := public.rpc_set_item_assignment(
  v_qa_1, v_code, 'qa', 'primary', 'assign', 'Gán QA chính'
);
v_result := public.rpc_set_item_assignment(
  v_qa_2, v_code, 'qa', 'collaborator', 'assign', 'Gán QA phối hợp'
);
```

Assert cả hai `vmp_item_rights(...).can_view = true`, `editable_fields` đúng tám trường, `scope_match = true`, `area_match = true`. Assert QA thứ ba không phân công có `can_view = false`. Thử gán QA thứ hai thành `primary` bằng action `assign` phải trả `PRIMARY_ALREADY_EXISTS`; action `replace_primary` phải hạ QA cũ thành collaborator và nâng QA mới nguyên tử. Thu hồi QA phối hợp làm mất quyền ngay.

- [ ] **Step 2: Chạy SQL harness để xác nhận thất bại**

Run: `bash scripts/test-item-permissions-sql.sh`  
Expected: FAIL vì signature/column `assignment_role` chưa có.

- [ ] **Step 3: Thêm schema và backfill deterministic**

Đầu tiên thêm cột nullable:

```sql
alter table public.vmp_item_assignments add column assignment_role text;
```

Sau đó backfill QA `sheet_qa` ưu tiên `primary`; dùng `row_number() over (partition by validation_code order by (source = 'sheet_qa') desc, created_at, id)` để chỉ dòng đầu là `primary`, còn lại `collaborator`. Nếu một người có nhiều nguồn QA active trên cùng hạng mục, giữ một dòng theo cùng thứ tự và deactivate dòng dư với `change_reason = 'Gộp nguồn phân công khi chuyển person_id'`.

Chỉ sau khi backfill hoàn tất mới thêm và validate constraint:

```sql
alter table public.vmp_item_assignments add constraint vmp_item_assignments_role_check
check (
  (assignment_kind = 'qa' and assignment_role in ('primary', 'collaborator'))
  or (assignment_kind = 'equipment_department' and assignment_role is null)
);
```

Thêm hai partial unique index:

```sql
create unique index vmp_item_assignments_one_active_qa_primary
on public.vmp_item_assignments(validation_code)
where assignment_kind = 'qa' and assignment_role = 'primary' and is_active;

create unique index vmp_item_assignments_one_active_qa_person
on public.vmp_item_assignments(validation_code, performer_id, assignment_kind)
where performer_id is not null and assignment_kind = 'qa' and is_active;
```

- [ ] **Step 4: Override RPC phân công**

Validation:

```sql
if p_assignment_kind = 'qa'
   and p_assignment_role not in ('primary', 'collaborator') then
  return jsonb_build_object('ok', false, 'error_code', 'INVALID_ASSIGNMENT_ROLE',
    'error', 'Phân công QA phải là phụ trách chính hoặc phối hợp');
end if;
if p_assignment_kind = 'equipment_department' and p_assignment_role is not null then
  return jsonb_build_object('ok', false, 'error_code', 'INVALID_ASSIGNMENT_ROLE',
    'error', 'Phân công thiết bị không nhận vai trò QA');
end if;
```

Quản lý QA không kiểm `scope_departments/access_areas`; họ chỉ được `assignment_kind = 'qa'` và target phải `department = 'qa'`, `access_class = 'qa_progress_editor'`, `is_active`. Admin có cùng thao tác. `replace_primary` lock mọi QA assignment của hạng mục, demote primary hiện tại, rồi cập nhật dòng active của target hoặc insert dòng mới trong cùng transaction. Không dùng `ON CONFLICT` mơ hồ giữa các partial index.

Không cho `qa_manager` trở thành target QA phụ trách thường; quản lý có quyền quản trị riêng, không nằm trong danh sách nhận việc trừ khi Admin đổi phân loại sang `qa_progress_editor`.

- [ ] **Step 5: Override lõi quyền và RPC đọc**

Nhánh QA phải chạy trước scope hierarchy:

```sql
if v_access_class = 'qa_progress_editor' then
  select coalesce(bool_or(a.is_active), false),
         coalesce(array_agg(distinct a.source), '{}'::text[])
  into v_has_qa_assignment, v_sources
  from public.vmp_item_assignments a
  where a.validation_code = p_validation_code
    and a.performer_id = v_person_id
    and a.assignment_kind = 'qa'
    and a.is_active
    and (a.expires_at is null or a.expires_at > now());
  return query select
    v_has_qa_assignment,
    case when v_has_qa_assignment then array[
      'actual_protocol_date', 'status_protocol',
      'actual_validation_date', 'status_validation',
      'actual_report_date', 'status_report',
      'actual_vmp_date', 'status_vmp'
    ]::text[] else '{}'::text[] end,
    case when v_has_qa_assignment then 'Có phân công QA đang hoạt động'
         else 'Chưa có phân công QA đang hoạt động' end,
    v_sources,
    v_has_qa_assignment,
    v_has_qa_assignment;
  return;
end if;
```

Chỉ principal có đồng thời `profiles.role = 'qa_manager'` và performer đang hoạt động với `access_class = 'qa_manager'` mới thấy toàn bộ hạng mục hoạt động để phân công và giữ tám trường QA theo hành vi hiện tại; không kiểm scope địa lý. `equipment_scheduler`, `equipment_manager`, `view_only` tiếp tục dùng hierarchy hiện hành. RPC preview trả `assignment_role`; với QA, các cờ scope được hiểu là “khớp phân công”.

Mở rộng preflight bằng `DUPLICATE_ACTIVE_QA_PRIMARY` và `DUPLICATE_ACTIVE_QA_PERSON`; hai lỗi này phải dùng cùng predicate với hai partial unique index.

- [ ] **Step 6: Chạy SQL harness hai lần để bắt phụ thuộc trạng thái**

Run: `bash scripts/test-item-permissions-sql.sh && bash scripts/test-item-permissions-sql.sh`  
Expected: cả hai PASS/ROLLBACK; migration và harness không để lại state.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260811100000_qa_theo_phan_cong_hang_muc.sql \
  tests/sql/item-permissions.sql
git commit -m "feat(phân công): hỗ trợ QA chính và QA phối hợp"
```

---

### Task 5: Thêm API và UI Admin nối tài khoản

**Files:**
- Create: `src/features/itemPermissions/AccountLinkPanel.tsx`
- Modify: `src/features/itemPermissions/types.ts`
- Modify: `src/features/itemPermissions/api.ts`
- Modify: `src/features/itemPermissions/StaffDirectoryPanel.tsx`
- Modify: `src/pages/PhanQuyenPage.tsx`
- Modify: `tests/unit/item-permission-contracts.test.mjs`

**Interfaces:**
- Produces type `AccountCandidate`.
- Produces API `searchAccountCandidates(query: string): Promise<AccountCandidate[]>`.
- Produces API `linkPermissionAccount(personId, userId, reason, expectedVersion)`.
- `AccountLinkPanel` callback `onLinked(personId: string): void` tăng `directoryRevision`; StaffDirectoryPanel tìm lại theo tên và chọn đúng `person_id`.

- [ ] **Step 1: Viết unit test fail cho decoder và args nối tài khoản**

```js
assert.deepEqual(decodeAccountCandidate({
  user_id: "user-1", email: "qa@vmp.local", full_name: "QA A",
  role: "viewer", department: "qa", is_active: true, linked_person_id: null,
}), {
  user_id: "user-1", email: "qa@vmp.local", full_name: "QA A",
  role: "viewer", department: "qa", is_active: true, linked_person_id: null,
});
assert.deepEqual(createLinkPermissionAccountArgs("person-1", "user-1", "Nối tài khoản", 3), {
  p_person_id: "person-1",
  p_user_id: "user-1",
  p_reason: "Nối tài khoản",
  p_expected_version: 3,
});
```

- [ ] **Step 2: Chạy unit test để xác nhận thất bại**

Run: `node --import tsx --test tests/unit/item-permission-contracts.test.mjs`  
Expected: FAIL vì decoder/API chưa tồn tại.

- [ ] **Step 3: Cài đặt kiểu và API**

```ts
export interface AccountCandidate {
  user_id: string;
  email: string;
  full_name: string;
  role: "admin" | "qa_manager" | "department_user" | "viewer";
  department: string | null;
  is_active: boolean;
  linked_person_id: string | null;
}
```

API gọi đúng RPC Task 3. Không tái sử dụng `lienKetTaiKhoan()` legacy vì hàm đó thiếu reason/version và không kiểm hợp đồng QA.

- [ ] **Step 4: Tạo AccountLinkPanel**

UI chỉ render khi `canManageAccounts` và đã chọn person. Trạng thái:

```tsx
{person.user_id ? (
  <button disabled={!reason.trim() || saving}
    onClick={() => linkPermissionAccount(
      person.person_id, null, reason.trim(), person.version
    )}>
    Gỡ nối tài khoản
  </button>
) : (
  <>
    <input aria-label="Tìm tài khoản để nối" value={query} />
    <select aria-label="Tài khoản sẽ nối" value={selectedUserId}>...</select>
    <input aria-label="Lý do nối tài khoản" value={reason} />
    <button disabled={!selectedUserId || !reason.trim() || saving}>Nối tài khoản</button>
  </>
)}
```

Ứng viên phải hiển thị tên, email, role, bộ phận; ứng viên `linked_person_id` khác null bị disabled và ghi “đã nối người khác”. Không có optimistic local link; sau thành công parent tìm lại person theo `person_id`.

- [ ] **Step 5: Gắn panel vào workspace hiện hành**

`CurrentPermissionWorkspace` nhận `user`; tính:

```ts
const canManageDirectory = isAdmin || user?.role === "admin";
const canManageQaAssignments = canManageDirectory
  || user?.role === "qa_manager"
  || user?.accessClass === "qa_manager";
```

Truyền `canEdit={canManageDirectory}` và `revision={directoryRevision}` vào danh bạ, render `AccountLinkPanel` chỉ Admin, và truyền `canEdit={canManageQaAssignments}` vào AssignmentPanel. Sau nối/gỡ, tăng `directoryRevision`; effect trong StaffDirectoryPanel gọi `searchPermissionDirectory(selected.full_name)`, dùng `findDirectoryPersonById` rồi nạp lại đúng hồ sơ. QA manager không thấy thao tác nối/cấp quyền.

- [ ] **Step 6: Chạy unit, typecheck và build**

Run: `npm run test:unit && npm run typecheck && npm run build`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/itemPermissions/AccountLinkPanel.tsx \
  src/features/itemPermissions/types.ts src/features/itemPermissions/api.ts \
  src/features/itemPermissions/StaffDirectoryPanel.tsx src/pages/PhanQuyenPage.tsx \
  tests/unit/item-permission-contracts.test.mjs
git commit -m "feat(danh bạ): cho Admin nối tài khoản theo person ID"
```

---

### Task 6: Làm form QA độc lập catalog và quản lý nhiều QA

**Files:**
- Modify: `src/features/itemPermissions/StaffDirectoryPanel.tsx`
- Modify: `src/features/itemPermissions/AssignmentPanel.tsx`
- Modify: `src/features/itemPermissions/EffectiveRightsPanel.tsx`
- Modify: `src/features/itemPermissions/api.ts`
- Modify: `tests/e2e/danh-ba-phan-quyen.mjs`

**Interfaces:**
- Consumes: `isQaAccessClass`, `requiresHierarchyScope`, `QaAssignmentRole`.
- `setItemAssignment()` nhận `assignmentRole: QaAssignmentRole | null` và action `assign | revoke | replace_primary`.
- StaffDirectoryPanel chỉ gọi `fetchScopeCatalog()` khi access class hiện tại cần hierarchy hoặc lần parse workbook bằng catalog rỗng phát hiện dòng ngoài QA cần hierarchy.

- [ ] **Step 1: Sửa E2E mock và viết assertion fail cho QA không gọi catalog**

Thêm counter `scopeCatalogCalls`. Mock QA:

```js
const qaPerson = {
  ...completePerson,
  department: "qa",
  access_class: "qa_progress_editor",
  scope_departments: [],
  scope_factory_ids: [],
  scope_area_ids: [],
  scope_line_ids: [],
};
```

Assertions:

```js
assert.equal(await documentContains("Phạm vi xưởng"), false);
assert.equal(await documentContains("Không tải được danh mục phạm vi"), false);
assert.equal(scopeCatalogCalls, 0, "form QA không được gọi RPC catalog");
assert.equal(await page.$eval('[data-testid="save-permission-person"]', b => b.disabled), false);
```

Mock assignment trả một `primary` và một `collaborator`; assert UI hiển thị “QA phụ trách chính”, “QA phối hợp”, “chưa có quyền truy cập” cho người chưa nối.

Mock thêm `rpc_item_permission_account_candidates` và `rpc_link_item_permission_account`. Ở persona Admin, tìm candidate rồi bấm nối; assert body có đúng `p_person_id`, `p_user_id`, `p_reason`, `p_expected_version` và danh bạ tải lại đúng `person_id`. Đổi sang persona Quản lý QA; assert không có nút/ô “Nối tài khoản” nhưng vẫn có nút phân công QA.

- [ ] **Step 2: Chạy E2E để xác nhận thất bại**

Run prerequisites: `npm run build` rồi chạy preview ở terminal riêng bằng `npm run preview -- --host 127.0.0.1`.  
Run: `node tests/e2e/danh-ba-phan-quyen.mjs`  
Expected: FAIL vì form vẫn gọi catalog/hiện bốn tầng và API chưa gửi `p_assignment_role`.

- [ ] **Step 3: Phân nhánh form StaffDirectory**

```ts
const isQa = isQaAccessClass(form.accessClass);
const needsScope = requiresHierarchyScope(form.accessClass);
```

Đổi `emptyForm.accessClass` từ `view_only` thành `null as AccessClass | null` và thêm option `— chọn phân loại —`; handler select đổi chuỗi rỗng về `null`, vì vậy component không gọi catalog ngay khi mở. Khi chọn hồ sơ QA hoặc đổi sang QA, set bốn mảng scope thành rỗng sau confirm nếu đang có dữ liệu. Chỉ render bốn `LinkedMultiSelect` khi `needsScope`. Nút lưu:

```tsx
disabled={saving || !dirty || !form.fullName.trim() || !form.department
  || !form.accessClass
  || (isQa && form.department !== "qa")
  || (needsScope && (!allScopeLevelsSelected || !scopeIsValid))}
```

Không khởi động `fetchScopeCatalog` khi form chưa chọn phân loại hoặc đang là QA. Khi import file, parse lần đầu với `emptyCatalog`; QA-only sẽ hợp lệ và không gọi catalog. Nếu kết quả có lỗi phạm vi trong khi catalog chưa tải, gọi `fetchScopeCatalog()` đúng một lần rồi parse lại cùng file; lỗi còn lại sau lần hai mới hiển thị.

Copy trạng thái QA:

- Badge hoàn chỉnh: “Quyền phát sinh từ phân công hạng mục”.
- Chưa nối: “Chưa nối tài khoản — có thể chuẩn bị phân công nhưng chưa cấp quyền”.
- Không dùng thông báo “thiếu phạm vi và khu vực” cho QA.

- [ ] **Step 4: Cập nhật AssignmentPanel cho role/action**

Với person QA, chỉ hiển thị:

```tsx
<select aria-label="Vai trò QA trong hạng mục" value={qaRole}>
  <option value="primary">QA phụ trách chính</option>
  <option value="collaborator">QA phối hợp</option>
</select>
```

Trước khi gán `primary`, gọi `fetchItemAssignments({ validationCode })` để biết QA chính hiện tại. Gửi:

```ts
await setItemAssignment({
  personId: person.person_id,
  validationCode: validationCode.trim(),
  assignmentKind: "qa",
  assignmentRole: qaRole,
  action: qaRole === "primary" && existingPrimary ? "replace_primary" : "assign",
  reason: reason.trim(),
});
```

Render nút “Thu hồi” trên mỗi assignment khi có quyền sửa; action revoke gửi đúng `person_id`, `validation_code`, `assignment_kind`, `assignment_role`, reason. Trước `replace_primary`, confirm nêu tên QA chính hiện tại và người mới.

- [ ] **Step 5: Cập nhật EffectiveRightsPanel**

Với người QA, thay dòng phạm vi bằng:

```tsx
<div>Phân công: {right.assignment_sources.length
  ? right.assignment_sources.join(" · ")
  : "chưa có phân công đang hoạt động"}</div>
```

Vai trò ngoài QA giữ chi tiết bộ phận/xưởng/khu vực/line.

- [ ] **Step 6: Chạy E2E, typecheck và build**

Run: `npm run build`  
Run preview trong terminal riêng: `npm run preview -- --host 127.0.0.1`  
Run: `node tests/e2e/danh-ba-phan-quyen.mjs`  
Run: `npm run typecheck`  
Expected: tất cả PASS; request QA có `p_assignment_role`, form QA không gọi catalog.

- [ ] **Step 7: Commit**

```bash
git add src/features/itemPermissions/StaffDirectoryPanel.tsx \
  src/features/itemPermissions/AssignmentPanel.tsx \
  src/features/itemPermissions/EffectiveRightsPanel.tsx \
  src/features/itemPermissions/api.ts tests/e2e/danh-ba-phan-quyen.mjs
git commit -m "feat(phân công): quản lý nhiều QA trên từng hạng mục"
```

---

### Task 7: Hồi quy quyền timeline, cache và tài liệu vận hành

**Files:**
- Modify: `tests/e2e/quyen-cot-timeline.mjs`
- Modify: `tests/e2e/thu-hoi-cache-phan-quyen.mjs`
- Modify: `docs/HANDOVER.md`

**Interfaces:**
- Consumes: `vmp_item_rights` và RPC mới từ Tasks 3–4.
- Produces: bằng chứng QA chính/phối hợp có cùng tám trường và thu hồi có hiệu lực ngay.

- [ ] **Step 1: Mở rộng fixture timeline cho QA chính/phối hợp/chưa phân công**

Ba persona nhận quyền dự kiến:

```js
const QA_FIELDS = [
  "actual_protocol_date", "status_protocol",
  "actual_validation_date", "status_validation",
  "actual_report_date", "status_report",
  "actual_vmp_date", "status_vmp",
];
```

Assert primary và collaborator đều có đúng `QA_FIELDS`; unassigned có `can_view: false`, `editable_fields: []`; tất cả không có `scheduled_at`.

- [ ] **Step 2: Mở rộng test thu hồi cache**

Mock lần đầu có assignment collaborator và lần sau revoke. Assert modal đang mở tải lại quyền thì khóa tám control, dashboard reload không còn hạng mục, và response cũ về trễ không khôi phục quyền.

- [ ] **Step 3: Chạy bộ E2E phân quyền**

Run build/preview như Task 6.  
Run: `node tests/e2e/quyen-cot-timeline.mjs`  
Run: `node tests/e2e/thu-hoi-cache-phan-quyen.mjs`  
Expected: PASS.

- [ ] **Step 4: Cập nhật HANDOVER theo trạng thái thật**

Ghi rõ:

- QA không cấu hình phạm vi; Admin nối tài khoản; Quản lý QA phân công theo hạng mục.
- Một QA chính và nhiều QA phối hợp có cùng tám trường.
- Migration mới chạy sau `20260810160000` và mode vẫn `preview`.
- Nếu migration chưa triển khai production, ghi “chưa triển khai”; chỉ đổi thành “đã triển khai” sau khi hậu kiểm database thật đạt.
- Lệnh nghiệm thu: `bash scripts/test-item-permissions-sql.sh`, `npm run test:permissions`, `npm run typecheck`, `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/quyen-cot-timeline.mjs \
  tests/e2e/thu-hoi-cache-phan-quyen.mjs docs/HANDOVER.md
git commit -m "test(phân quyền): nghiệm thu QA theo phân công hạng mục"
```

---

### Task 8: Verification gate và chuẩn bị triển khai

**Files:**
- Verify only; sửa đúng file gây lỗi nếu kiểm thử phát hiện hồi quy.

**Interfaces:**
- Produces: bản code/migration đã kiểm thử nhưng chưa tự triển khai production.

- [ ] **Step 1: Chạy toàn bộ unit và SQL rollback**

Run: `npm run test:unit`  
Expected: tất cả test PASS.

Run: `bash scripts/test-item-permissions-sql.sh`  
Expected: PASS và `ROLLBACK`.

- [ ] **Step 2: Chạy toàn bộ bộ phân quyền**

Run build/preview ở terminal riêng.  
Run: `npm run test:permissions`  
Expected: unit + bốn E2E phân quyền PASS.

- [ ] **Step 3: Chạy kiểm tra tĩnh và production build**

Run: `npm run typecheck && npm run build`  
Expected: exit code 0.

- [ ] **Step 4: Kiểm tra migration production ở chế độ read-only**

Không chạy DDL. Chỉ kiểm:

```sql
select public.item_permissions_mode();
select to_regprocedure('public.rpc_item_permission_scope_catalog()');
select to_regclass('public.vmp_scope_factories');
select count(*) from public.vmp_performers where is_active;
```

Expected trước deploy hiện tại: mode `preview`, RPC/table phạm vi chưa tồn tại, danh bạ vẫn có dữ liệu.

- [ ] **Step 5: Dừng tại checkpoint production**

Không chạy migration, push hoặc deploy nếu chưa có phê duyệt rõ ràng. Báo:

- Commit range đã tạo.
- Kết quả từng lệnh test.
- Migration dự kiến áp theo một transaction: `20260810160000` rồi `20260811100000`.
- Hậu kiểm bắt buộc: mode vẫn `preview`; QA scope rỗng không có lỗi incomplete; không có hai QA primary; RPC nối tài khoản chỉ Admin gọi được.

- [ ] **Step 6: Commit sửa verification nếu có**

Nếu Step 1–3 yêu cầu chỉnh sửa, stage đúng các file đã sửa rồi:

```bash
git commit -m "fix(phân quyền): hoàn tất nghiệm thu QA theo hạng mục"
```

Nếu không có thay đổi thì không tạo commit rỗng.
