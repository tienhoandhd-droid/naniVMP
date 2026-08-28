# Source QA and Workshop Access Design

**Date:** 2026-08-28

**Planning baseline:** `feat/source-qa-workshop-scope` at `b2c6896`

**Production evidence date:** 2026-08-28, read-only linked-project queries

**Security posture:** fail closed, server authoritative, least privilege

## 1. Outcome

Source Data becomes the canonical authorization boundary for its related VMP
items:

- Admin and QA Manager can select an active eligible QA owner and QA support
  person on a Source object.
- A QA staff member can view that Source object and its related active items,
  and can edit the existing seven-field QA progress allowlist, only while that
  person's canonical performer ID is the Source owner or support ID.
- Workshop people use a separate coverage model. An active area grant gives
  read access to Source objects and related items in that exact department and
  area; an optional line narrows the grant to that line. Coverage alone never
  grants a progress write. `actual_validation_date` still requires both a
  current `equipment_department` item assignment and a matching coverage
  grant.
- Admin and QA Manager manage workshop coverage in a narrow Source-adjacent
  workspace. This does not reopen the Admin-only account, role, or general
  personnel-management screens.
- Every browser-accessible Source reader, dashboard, warning, suggestion,
  export, RLS policy, and SECURITY DEFINER function enforces the same predicates
  on the server.

Owner/support changes take effect at the commit of `rpc_save_catalog_object`.
They do not wait for a pending planned-timeline change to be applied. Progress
and actual/status writes update `vmp_plan_items` only; they do not write back to
Source master fields.

## 2. Evidence and constraints

### 2.1 Repository state

The current UI and database have several authorization gaps:

- `CatalogWorkspaceShell.tsx` reads whole Source kinds through a direct table
  query, filters and paginates in the browser, and exports the browser array.
- `usePerformers()` reads all visible performers, defaults to `[]`, and catches
  the error silently. `buildActivePerformerChoices()` checks only
  `is_active`; it does not enforce an active QA principal.
- `useCatalogSuggestions()` preloads Source rows, including inactive rows, and
  silently suppresses errors.
- `KhongThamDinhCard.tsx` performs another direct Source read and client export.
- `rpc_get_vmp_dashboard`, `rpc_get_vmp_watermark`, and
  `rpc_source_warnings` are active-session wrappers around implementations that
  can return broader data than the caller's Source relationship.
- The existing five-role migration retained permissive active-session RLS for
  Source and plan-item reads. A valid session is not a sufficient object-level
  authorization predicate.
- `vmp_item_rights()` currently derives QA staff access from materialized
  `vmp_item_assignments`; it does not treat Source support as an equally
  authoritative relationship.
- The Source workspace exposes products and alert recipients to every Source
  viewer. `rpc_list_catalog_dataset` similarly permits any active session.
- General account/role management is intentionally Admin-only after
  `20260828130000_admin_only_management_visibility.sql` and must remain so.

### 2.2 Read-only production facts

The design uses these facts as deployment preflight evidence, not as hard-coded
runtime assumptions:

- 272 Source objects, all active;
- 461 active plan items;
- every active item maps to exactly one active Source object, with no missing
  or multiple match, and every `vmp_objects` row maps to Source;
- Source `object_code` is globally unique in the current data, although the
  schema contract remains `(object_kind, object_code)`;
- 281 items have an owner projection and 126 have a support projection;
- plan-item owner/support columns currently match their Source projections;
- the QA assignment projection is incomplete: two owner assignments and 24
  support assignments are missing;
- 389 total assignment rows;
- 16 active performers and seven currently eligible QA selector people;
- screen mode is `enforced`; item-permission mode remains `preview`;
- Source permissions currently give Admin/QA Manager all-data edit/generate,
  QA staff all-data view, and workshop roles a nominal workshop scope;
- canonical factory/area/line catalog tables are empty and all three active
  workshop people have empty legacy scope arrays;
- active Source rows contain seven distinct departments, 28 non-empty areas,
  and 24 non-empty line labels; two active rows have no area and 109 have no
  line.

The 26 missing assignment projections prove that QA authorization cannot use
materialized assignment rows as its source of truth. The empty hierarchy proves
that a factory tree cannot be inferred safely from production.

### 2.3 Explicit boundaries

- No password retrieval, display, reset, or Auth credential work.
- No email/name/regex identity matching. Authorization uses UUIDs.
- No fabricated factory hierarchy. Source has no real factory dimension, so
  this release implements the approved real dimensions: department + area,
  optionally narrowed to line. Factory coverage is a future additive feature
  only after Source stores an authoritative factory value.
- The two active Source rows without `area_code` are invisible to workshop
  roles. Admin or QA Manager must correct Source data before workshop access is
  possible.
- The 109 rows without line remain eligible for an area-wide grant; a
  line-specific grant does not match a line-less row.
- Products, alert recipients, import, pending changes, and global history stay
  available only to Admin/QA Manager through their existing Source editor
  capability. Lower Source viewers see only authorized Source objects.
- Client capability checks improve presentation only. They are never the data
  boundary.

## 3. Authorization model

### 3.1 Role matrix

| Principal | Source objects | Related item view | Progress write | Source assignment management | Workshop coverage management | Non-object Source tabs |
| --- | --- | --- | --- | --- | --- | --- |
| Admin | All, including explicitly requested inactive rows | Existing Admin rule | Existing Admin allowlist | Yes | Yes | Yes |
| QA Manager | All active and authorized inactive requests | All active related items | Existing eight QA actual/status fields | Yes | Yes | Yes |
| QA staff | Only Source where `owner_person_id` or `support_person_id` is their performer ID | Only active items linked to those Source rows | Existing seven QA fields; excludes `actual_validation_date` | No | No | No |
| Workshop Manager | Only Source matching an active area/line grant | Active items linked to matching Source | `actual_validation_date` only when a current item assignment also exists | No | No | No |
| Workshop staff | Same Source view rule as Workshop Manager | Same Source view rule | Same assignment-and-scope one-field rule | No | No | No |
| Inactive, unresolved, duplicate principal, legacy Viewer | None | None | None | No | No | No |

The workshop-manager ability to assign workshop staff remains a separate
progress capability and does not create Source coverage.

### 3.2 QA predicate

For an active plan item that resolves to its one active Source object through
the existing canonical `object_code`, QA staff access is:

```text
active session
AND exactly one active performer linked to auth.uid()
AND effective business role = qa_staff
AND source is active
AND (source.owner_person_id = performer.id
     OR source.support_person_id = performer.id)
```

This predicate directly reads Source, not `vmp_item_assignments`. The assignment
table remains a compatibility/audit projection for current screens and reports.
Its absence must be reported and repaired, but it must not cause a false denial
when canonical Source already establishes the relationship.

For a source-related item, an unrelated manual QA assignment does not grant
access. An active item with zero or multiple active Source matches fails closed
for QA/workshop roles. Admin and QA Manager retain their existing managerial
rules so data can be repaired.

### 3.3 Workshop predicate

`vmp_source_workshop_scope_grants` stores an active grant for one canonical
performer and one exact Source tuple:

```text
(performer_id, normalized department, normalized area_code,
 normalized line or NULL)
```

- `line_key IS NULL` means the whole exact `(department, area_code)`.
- A non-null `line_key` means only that exact
  `(department, area_code, line)`.
- Department is mandatory so repeated area/line labels in different
  departments never collide.
- Source with blank area never matches.
- A line grant never matches Source with blank line.
- Inactive, expired, or soft-revoked grants never match.

Workshop Source/item **view** is `scope_match`. Workshop
`actual_validation_date` **edit** is:

```text
scope_match
AND an active, unexpired vmp_item_assignments row
    for the same performer and validation_code
    with assignment_kind = 'equipment_department'
```

The two predicates remain separate in SQL and tests. No helper may derive edit
from `can_view` alone.

### 3.4 Capabilities

Add only these actions to the `source` rows for `admin` and `qa_manager` in
`vmp_screen_permissions`:

- `manage_qa_assignment`
- `manage_workshop_scope`

Keep `edit_catalog` and `generate_timeline` unchanged. Do not modify
`ADMIN_ONLY_SCREEN_IDS`, `managementWorkspaceFor()`, the `accounts` screen, the
`phanquyen` screen, or any general account/role capability. Server helper
functions resolve the current role again and do not trust a client-provided
action string.

## 4. Data model

### 4.1 Canonical item-to-Source relation

Use the relation already present throughout the application:
`vmp_plan_items.object_code -> vmp_objects.code -> active
vmp_source_objects.object_code`. Production proves all 461 active items resolve
to exactly one active Source row and no active Source codes collide.

The expand migration creates a partial unique index on active
`vmp_source_objects(object_code)`, adds the matching active plan-item lookup
index, and aborts if an active item has zero/multiple active Source matches.
The private resolver returns no row unless the match is exact. Existing writer
signatures remain compatible; timeline generation, catalog apply, manual item
creation, sheet reconciliation, import, and Source activation are reviewed to
ensure they cannot create an active orphan or duplicate active Source code.

This is deliberately smaller and safer than adding `source_object_id`: it uses
the current global object identity and avoids a backfill/FK plus changes to every
writer. A future change that permits the same active code in multiple Source
kinds must first introduce an explicit item Source UUID in its own migration.

### 4.2 Workshop grant table

Create `public.vmp_source_workshop_scope_grants` with:

| Column | Contract |
| --- | --- |
| `id uuid` | Primary key, generated UUID |
| `performer_id uuid` | Required FK to `vmp_performers(id)` |
| `department text` / `department_key text` | Required display value and normalized key |
| `area_code text` / `area_key text` | Required display value and normalized key |
| `line text` / `line_key text` | Optional display value and normalized key; both null or both non-null |
| `valid_from timestamptz` | Defaults to transaction time |
| `expires_at timestamptz` | Optional; must be later than `valid_from` |
| `is_active boolean` | Soft-revocation flag |
| `version integer` | Starts at 1; optimistic update version |
| `created_at`, `created_by`, `updated_at`, `updated_by` | Audit metadata |
| `change_reason text` | Required nonblank reason for the current mutation |

`vmp_source_scope_key(text)` is one reviewed immutable normalizer: trim,
collapse internal whitespace, and lower-case. It does not strip Vietnamese
diacritics and does not guess aliases. The writer calculates keys; constraints
require stored keys to equal the helper output.

Three partial unique indexes prevent duplicate active coverage:

- `(performer_id, department_key, area_key)` where active and line is null;
- `(performer_id, department_key, area_key, line_key)` where active and line is
  not null;
- `id, version` for optimistic writes.

Revocation sets `is_active=false`; it never deletes history. Grant rows are not
general personnel records and contain no password/account-management fields.

### 4.3 QA projection and audit

Source `owner_person_id` and `support_person_id` remain canonical. Related
`vmp_plan_items.owner_person_id` and `support_person_id` remain display/report
projections. The private reconciler also maintains active QA assignment rows:

- owner -> `assignment_kind='qa'`, `assignment_role='primary'`,
  `source='source_owner'`;
- support -> `assignment_kind='qa'`, `assignment_role='collaborator'`,
  `source='source_support'`.

Old Source projection rows are soft-revoked. Manual rows are not silently
rewritten, but they are non-authoritative for source-linked QA access. When a
manual/legacy active row conflicts with the canonical projection, reconciliation
soft-revokes or demotes it with an explicit row-level audit and nonblank reason.
The two existing active-QA uniqueness indexes remain enforced. If owner and
support are the same person, one active `source_owner` primary row satisfies
both relationships and any duplicate `source_support` row stays inactive.

The expand migration creates the private reconciler but does not run it. The
enforce migration first installs a projection-aware refresh implementation,
then repairs the current missing owner/support projections in stable Source
order and emits counts to the checker. A second reconciliation is a no-op. A
health query continues to report Source/plan/assignment drift independently of
effective rights.

### 4.4 Authorization revision

Create a singleton `vmp_authorization_revision` row and the private
`vmp_touch_authorization_revision()` helper. Transactional triggers touch it
once per transaction when authorization-relevant columns change on:

- Source owner/support/active state;
- workshop grants;
- performer link, active state, or access class;
- profile active state or login role;
- item `object_code`/active state and Source `object_code`/active state;
- workshop item assignments.

The revision is returned by dashboard and watermark RPCs. It invalidates
rights-bearing browser snapshots and coalesces focus refreshes. The server
predicate remains authoritative even if a client misses an invalidation.

## 5. Atomic write and concurrency design

### 5.1 Source owner/support save

`rpc_save_catalog_object(text,text,jsonb,text,integer)` keeps its public
signature. Its reviewed implementation:

1. requires an active session and effective Admin or QA Manager;
2. validates the optimistic Source version and locks the Source row;
3. splits `p_patch` into master fields, timeline fields, and access fields;
4. validates each non-null owner/support ID as an active, uniquely linked QA
   principal at write time;
5. writes Source master/access fields;
6. locks related plan items in `validation_code` order, writes owner/support
   display projections, and reconciles compatibility assignments in stable
   `(validation_code, performer_id, assignment_role)` order;
7. records Source, plan, assignment, and access audit data and touches the
   authorization revision;
8. stores only the timeline-field subset in a pending catalog change; and
9. commits or rolls back the entire operation.

There are no `owner_assignments_failed` or `owner_revocations_failed` partial
success arrays. A projection failure makes the save fail before commit. Existing
projection drift does not deny canonical rights; it is repaired by the expand
migration and the health checker.

Owner/support are removed from `vmp_catalog_timeline_fields()` and frontend
`TRUONG_ANH_HUONG_TIMELINE`. They remain reason-required access fields. An
assignment-only save creates no planned-timeline pending record. A patch that
also changes frequency/date-driving fields commits the new access relationship
immediately while staging only the planned-timeline subset. Later preview/apply
cannot replay or overwrite owner/support.

### 5.2 Progress writer isolation

All relevant writers use this lock order:

```text
Source object -> matching workshop grant rows -> plan item -> item assignments
```

The enforced progress writer resolves the one active Source row by indexed item
`object_code`, takes a Source
`FOR KEY SHARE` lock, locks the matching grant/assignment evidence when the
actor is workshop, then resolves the current allowlist and writes the item.
Source assignment save uses `FOR UPDATE` on Source. Grant update/revoke uses
`FOR UPDATE` on the grant. Therefore a concurrent write linearizes either
before a revoke (valid under the old committed relationship) or after it
(denied under the new relationship); it cannot commit based on relationship
evidence revoked earlier in commit order.

### 5.3 Progress never mutates Source

`rpc_update_progress` and planned-deadline writers may update only their exact
plan-item allowlists and audit/version metadata. SQL tests snapshot the entire
Source row, audit count, owner/support, timeline revision, and updated metadata
before each QA/workshop progress write and prove byte-for-byte Source equality
after success and failure. No trigger copies actual dates or statuses back to
`vmp_source_objects`.

## 6. Server functions and RLS

### 6.1 Private predicates

The enforcement migration creates/replaces these private, reviewed helpers:

- `vmp_can_manage_source_qa_assignment(uuid) returns boolean`
- `vmp_can_manage_source_workshop_scope(uuid) returns boolean`
- `vmp_source_scope_key(text) returns text`
- `vmp_source_workshop_scope_match(uuid,uuid) returns boolean`
- `vmp_can_view_source_object(uuid,uuid) returns boolean`
- `vmp_can_view_plan_item(uuid,text) returns boolean`
- `vmp_item_scope_matches(uuid,text)` with department/area/line grant semantics
- `vmp_item_rights(uuid,text)` with direct Source owner/support QA semantics and
  distinct workshop view/edit semantics

Only reviewed server functions/service role execute private helpers. Browser
callers never pass a target user ID to a public rights resolver.

### 6.2 Public Source APIs

All return a JSON object with `ok`, stable `error_code`, and an explicit empty
result only on successful zero matches. Transport/authorization errors are not
converted to empty arrays.

| Function | Purpose and boundary |
| --- | --- |
| `rpc_list_source_objects(text,text,jsonb,jsonb,integer,boolean,uuid)` | Rights-filtered keyset list by kind/search/filter/cursor; limit 1–100; optional exact object ID for deep link; inactive only for Admin/QA Manager |
| `rpc_source_object_facets(text,jsonb)` | Rights-filtered bounded department/area/owner facets for the current search |
| `rpc_export_source_objects(text,text,jsonb,jsonb,integer)` | Same predicate/filter as list; 1–500 rows per cursor page; export is audited |
| `rpc_source_field_suggestions(text,text,text,jsonb,integer)` | Admin/QA Manager only; allowlisted field, keyset pagination, no whole-table preload |
| `rpc_source_qa_candidates(text,jsonb,integer,uuid[])` | Admin/QA Manager only; active eligible QA principals, 1–50 rows, keyset cursor; included current IDs returned separately with eligibility status |
| `rpc_list_source_workshop_coverage(text,jsonb,integer)` | Admin/QA Manager only; active workshop principals, including people with zero grants, with paged active/revoked coverage summary |
| `rpc_source_workshop_scope_choices(text,text,text,jsonb,integer)` | Admin/QA Manager only; distinct real Source department/area/line choices; no canonical-table assumption |
| `rpc_set_source_workshop_scope_grant(uuid,uuid,text,text,text,boolean,text,integer)` | Create/change/soft-revoke one grant with version, reason, eligibility, tuple, and capability validation |

`rpc_source_qa_candidates` eligibility requires: active performer; unique active
profile link; active profile; effective role `qa_staff` or `qa_manager`; and QA
access class/department consistency accepted by the canonical role resolver.
The result `rows` contains only eligible people. `included_current` can describe
a now-ineligible selected owner/support so the form shows and labels existing
data without silently clearing it.

### 6.3 Existing functions that must be replaced or guarded

The change must review and pin every current SECURITY DEFINER function that
directly or transitively reads/writes Source, plan items, assignments, or Source
catalog changes. At minimum:

- `rpc_get_vmp_dashboard(integer,boolean,boolean)`
- `rpc_get_vmp_watermark(integer)`
- `rpc_source_warnings(integer)`
- `rpc_save_catalog_object(text,text,jsonb,text,integer)`
- `rpc_generate_timeline(integer,boolean)`
- `rpc_create_plan_item(text,text,integer,integer,jsonb)`
- catalog preview/apply V1 and V2 functions;
- `rpc_list_catalog_changes`, catalog history/detail, Source import stage/commit,
  Source row sync/upsert, delete/deactivate, missing/reconcile, and assignment
  refresh functions;
- `rpc_my_editable_progress_rights()`, `vmp_my_item_rights(text)`, and
  `rpc_update_progress(text,jsonb,text,jsonb,integer)`;
- KPI, due-alert, data-quality, report, or other SECURITY DEFINER readers whose
  definition references `vmp_source_objects` or `vmp_plan_items`.

The migration generates a `pg_proc` inventory from function definitions and
fails if a Source/item reader is not classified as one of:

- rights-filtered browser reader;
- manager-only browser writer/reader;
- private implementation with no browser/service execute grant as appropriate;
- service-only maintenance function with a reviewed service-role boundary.

Updating an allowlist without reviewing the function definition is not
permitted. Legacy renamed implementations remain private. All new SECURITY
DEFINER functions are owned by `postgres`, set
`search_path=public, pg_temp`, reject anon/public, and have exact ACL tests.

`rpc_list_catalog_dataset` rejects products/alerts for roles other than Admin
or QA Manager. Import, pending, global history, and related catalog writers
perform the same server role check. This closes the current non-object tab leak
even when a caller bypasses the navigation.

### 6.4 RLS

- `vmp_source_objects` SELECT uses
  `vmp_can_view_source_object(auth.uid(), id)`; lower roles see active rows only.
- `vmp_plan_items` SELECT uses
  `vmp_can_view_plan_item(auth.uid(), validation_code)`.
- `vmp_source_workshop_scope_grants` SELECT permits Admin/QA Manager or the
  performer linked to the current user; all mutations remain RPC-only.
- `vmp_item_assignments` SELECT permits Admin/QA Manager or the assignment's
  own performer. Progress rights/read APIs expose only the minimal derived
  result needed by other roles.
- Direct INSERT/UPDATE/DELETE for authenticated users remains revoked on
  Source, grants, plan items, assignments, profiles, and performers.
- Products/alert-recipient RLS is aligned with the manager-only Source dataset
  rule so direct table reads cannot bypass `rpc_list_catalog_dataset`.
- `vmp_legacy_action_map` is a permission dependency of `muc_quyen` and is not
  client-managed data. Enable RLS without FORCE, expose zero policies, revoke
  all table and column privileges from PUBLIC, anon, authenticated, and
  service_role, and retain only the exact postgres owner ACL with no non-owner
  column ACL. Existing postgres-owned SECURITY DEFINER permission resolution
  continues to read it. This closes the
  reviewed baseline path where a lower role could rewrite a legacy action into
  an action it already owns and thereby influence older authorization checks.

Service role is not silently treated as a browser persona. Maintenance calls
must enter an explicitly classified service-only function.

## 7. Dashboard, warning, export, and cache data flow

`rpc_get_vmp_dashboard` builds one visible Source-object CTE for the caller and
joins both `objects` and `activities` to it. It does not fetch all rows and rely
on React filters. Admin/QA Manager get their existing global set; QA staff get
owner/support Source relations; workshop roles get area/line coverage relations.

`rpc_get_vmp_watermark` calculates counts and maxima over the same visible set
and returns `authorization_revision`. It must not reveal a global row count or
timestamp side channel. Warnings, facets, suggestions, and exports reuse the
same predicate and filters.

Protected browser snapshots include user ID, plan year, permission mode, and
authorization revision. A snapshot is not rendered until a fresh watermark
confirms the revision; watermark failure clears protected data. Focus,
visibility, successful Source assignment/coverage changes, and progress
assignment changes trigger a coalesced refresh. Server denial remains immediate
regardless of browser cache state.

## 8. Frontend design

### 8.1 Source workspace

`CatalogWorkspaceShell` stops importing `usePerformers` and stops calling
`fetchSourceObjects` directly. Object list state comes from
`rpc_list_source_objects`; search/filter changes are debounced, sequence-guarded,
and reset the keyset cursor stack. Facets come from the server. The object count,
desktop/mobile rows, deep links, warnings, and export all reflect the same
rights-filtered request.

The workspace navigation adds `coverage` / **Phạm vi xưởng** and applies:

- Admin/QA Manager: objects, products, alerts, import, pending, history, and
  coverage according to existing edit/generate plus new scope capability;
- QA/workshop viewer: objects only.

A rights change while a hidden tab is open moves to objects before any new
request. Server denial is still required for the hidden RPC.

### 8.2 QA owner/support selector

Replace the generic performer array prop with a Source-specific candidate
controller. Its state is exactly:

- `idle`
- `loading`
- `ready` with zero or more eligible candidates and `nextCursor`
- `error` with message and Retry

The hook queries an empty search for the first 25 eligible people, debounces
typed search by 250 ms, guards stale responses, and loads more by server cursor.
It never preloads inactive/all performers. Owner and support both use the same
eligibility contract.

Error and empty are visually distinct:

- error: `role="alert"`, “Không tải được danh sách nhân sự QA”, server message,
  and Retry; selectors do not render an empty success list;
- successful zero: “Không có nhân sự QA đang hoạt động đủ điều kiện”;
- existing now-ineligible selection: retain ID/name in the comparison view,
  label “không còn đủ điều kiện”, and permit explicit replace or clear;
- an unchanged owner/support does not block saving unrelated Source master
  fields when the candidate endpoint is unavailable;
- selecting a new person is disabled until candidate state is ready, and the
  server validates eligibility again on save.

No name is sent as authority. The patch contains person UUIDs only; the server
writes display-name projections from its locked performer row.

### 8.3 Workshop coverage panel

The narrow panel supports:

1. server search/page of active workshop principals, including those with no
   coverage;
2. server-derived Source choices: department, then required area, then optional
   line;
3. a clear label that blank line means the whole area;
4. create/change/soft-revoke with mandatory reason and optimistic version;
5. visible retry/error/empty states;
6. a data-quality banner showing Source objects without area, which remain
   workshop-invisible; and
7. audit-friendly display of active/revoked state, updater, time, and reason.

It cannot edit names, emails, active status, access class, role, account link,
password, general scope arrays, or any Admin-only screen. The panel does not
reuse the broad `StaffDirectoryPanel` form.

### 8.4 Source import and auxiliary object card

`CatalogExcelImport` no longer preloads all Source objects. It sends the parsed
batch to the manager-only staging RPC, which performs identity/diff checks on
the server. `KhongThamDinhCard` uses the paginated Source list with
`validate_flag='n'` and the server export cursor. All errors stay visible.

## 9. Performance contract

### 9.1 Indexes

The expand migration adds and verifies:

- Source list: `(object_kind, is_active, object_code, id)`;
- Source QA relation: partial `(owner_person_id, id)` and
  `(support_person_id, id)` for active rows;
- Source scope: immutable expression indexes on
  `(department_key, area_key, id)` and
  `(department_key, area_key, line_key, id)` for active rows;
- plan relation: `(object_code, year, is_active, validation_code)`;
- grants by person: `(performer_id, is_active, expires_at)`;
- grants by area: `(department_key, area_key, performer_id)` where active and
  line null;
- grants by line: `(department_key, area_key, line_key, performer_id)` where
  active and line non-null;
- assignments: `(performer_id, validation_code, assignment_kind)` and
  `(validation_code, performer_id, assignment_kind)` for active rows;
- candidate directory: active access-class/name/ID and active profile/user
  lookup indexes required by the keyset query.

No component loads every inactive performer. Source list limits are 100,
candidate/coverage limits 50, and export page limit 500. Rights are resolved in
set-based CTEs/batches rather than one RPC per row.

### 9.2 Acceptance

Disposable PostgreSQL 17 tests use realistic cardinalities and `EXPLAIN
(ANALYZE, BUFFERS, FORMAT JSON)` to prove the lower-role list/dashboard queries
use the person/scope/relation indexes and do not perform a full unrelated
performer or assignment scan. Frontend mock E2E asserts bounded request counts:
one list request per settled filter change, one candidate page at a time, and
cursor export pages only on explicit export.

## 10. Migration and release strategy

### 10.1 Artifacts

Two transaction-owned forward migrations are used:

1. `20260828140000_source_qa_workshop_access_expand.sql` — schema, grant table,
   authorization revision, constraints, indexes, and additive helpers. It
   installs a same-signature fail-closed
   `rpc_refresh_source_item_assignments()` upgrade stub, revokes its service-role
   execution, and proves existing plan/assignment projections are unchanged;
2. `20260828150000_source_qa_workshop_access_enforce.sql` — projection-aware
   refresh replacement, stable audited reconciliation, atomic Source writer,
   timeline-field separation, role predicates, item rights, RLS, all reader and
   SECURITY DEFINER replacements, capability rows, ACL/inventory, and
   postconditions. It first proves every non-ACL reconciliation and security
   postcondition, then restores the exact owner+service-role refresh ACL,
   asserts that final ACL and the remaining postconditions, and commits.

The expand migration can safely commit while the old reader boundary remains
because it does not mutate projections and the destructive legacy refresh is
temporarily replaced by an owner-safe fail-closed stub. Each migration takes
the same transaction-scoped advisory lock. Because the linked-CLI calls are
separate database sessions, the operator serializes them and forbids concurrent
legacy apply/recovery scripts; the fail-closed stub is the actual protection in
the gap. The enforce migration is one transaction, so no browser-visible
mixture of new RLS and old unfiltered RPCs commits. A failed enforce rolls back
to the expand state with refresh still unavailable.

### 10.2 Preflight

The read-only checker records counts/digests only and aborts on:

- branch/artifact/hash drift;
- wrong linked project;
- non-PostgreSQL-17 production or local clone;
- missing/overloaded/drifted dependency signatures;
- active items with zero/multiple Source match;
- Source/plan owner/support mismatch;
- invalid owner/support performer references;
- ambiguous active performer principal;
- no active Admin;
- unexpected screen/item mode;
- unreviewed SECURITY DEFINER Source/item reader;
- invalid RLS/ACL baseline;
- failure to capture the reviewed pre-change schema/function/policy/ACL hashes
  needed by forward recovery.

Empty workshop grants are not converted into broad access. They produce an
explicit coverage readiness blocker for workshop persona acceptance. Area-less
Source rows are counted and remain denied.

### 10.3 Production apply

The linked CLI is the supported production path; no pooler password or raw
connection string is required:

```bash
supabase --version
test "$(supabase --version)" = "2.113.0"
test "$(tr -d '\n' < supabase/.temp/project-ref)" = "ivembmikfhtyzhtqebgh"
supabase backups list --project-ref ivembmikfhtyzhtqebgh --output json
supabase db query --linked --file scripts/check-source-qa-workshop-access-preflight.sql
supabase db query --linked --file supabase/migrations/20260828140000_source_qa_workshop_access_expand.sql
supabase db query --linked --file supabase/migrations/20260828150000_source_qa_workshop_access_enforce.sql
supabase db query --linked --file scripts/check-source-qa-workshop-access.sql
```

Every SQL file owns its `BEGIN`/`COMMIT`; the checkers own `BEGIN READ ONLY` and
`ROLLBACK`. Production currently reports no physical-backup entry, `pitr=false`,
and `walg=true`. The backups command records that limitation; it is not treated
as a nonexistent restore point or a deploy blocker. Before apply, the operator
captures reviewed schema/function/policy/ACL definitions and hashes in the
restricted evidence directory. Transaction rollback, those captures, and the
reviewed forward-recovery artifact are the available recovery controls. The
operator captures sanitized JSON/count/digest evidence and does not print
session tokens, person UUIDs, emails, names, or row payloads.

Frontend deploy occurs only after database postflight and independent security
review of the exact SHA. Schema cache reload and lower-role persona probes use a
fresh session.

### 10.4 Recovery

- Failure before an individual migration commit rolls back that migration.
- If expand committed but enforce failed, leave the additive schema in place,
  block frontend rollout, diagnose, and apply a reviewed forward correction.
- If enforce committed but frontend failed, keep the safer server boundary and
  redeploy the previous frontend SHA; do not reopen the old broad RPCs.
- Forward recovery may revoke new mutator execute grants and deny lower-role
  Source access while preserving Admin/QA Manager repair access. It does not
  restore permissive all-session readers.
- Do not drop grant/audit/relation data and do not restore the whole production
  database over post-release writes. Any state correction is UUID-targeted,
  audited, forward-only, and separately reviewed.

## 11. Verification and acceptance

### 11.1 Database behavior

- Seven live eligible QA candidates are returned under the reviewed production
  snapshot, inactive/non-QA/ambiguous people are excluded, and endpoint failure
  is distinguishable from a successful empty result.
- Owner and support each grant QA view and seven-field edit immediately after
  commit; change/removal revokes immediately.
- The current 26 projection gaps are repaired, but deleting a compatibility
  assignment in a rollback-only test does not remove canonical QA access.
- A support-only Source remains one canonical collaborator; reconciliation
  never invents or promotes a primary when the owner is empty.
- Failure injected immediately before repair and again after repair but before
  commit rolls the entire enforce migration back to the expand state: the
  fail-closed refresh stub and revoked service ACL remain, and projection
  hashes/counts are unchanged.
- Unrelated manual QA assignment does not grant a source-linked item.
- Workshop area grant shows Source/items without an item assignment; editable
  fields remain empty.
- Workshop line grant matches only the exact line. Area grant matches the 109
  line-less records in that area; line grant does not.
- The two area-less Source records remain workshop-invisible.
- Adding the current equipment assignment changes only workshop edit to the
  one allowed field; removing either assignment or coverage revokes edit.
- Mixed allowed/forbidden progress payloads fail atomically.
- QA/workshop progress success and failure leave Source master rows unchanged.
- Inactive/unresolved sessions and unauthorized SECURITY DEFINER calls fail
  closed without row-count/timestamp leakage.

### 11.2 UI and E2E

- Admin and QA Manager can search/page/select owner/support and manage coverage.
- Candidate transport/RPC failure shows alert and Retry, never an empty select.
- QA/workshop viewers see only the object tab and only authorized rows; direct
  products/alerts/import/pending/history calls return `FORBIDDEN`.
- Owner/support change in one session becomes visible/hidden in a QA session
  after focus/reload; an open progress modal revalidates and closes/clears on
  revoke.
- Coverage change similarly updates workshop dashboard/Source view, while edit
  remains assignment-gated.
- Search, filters, pagination, deep link, warnings, and exports use server
  results and never include an unauthorized fixture.

### 11.3 Completion gate

Completion requires fresh typecheck, unit, PostgreSQL business/security/
performance suites, mock E2E for Source and progress rights, accessibility,
build, whole-diff review, CI at the exact SHA, production preflight/apply/
postflight, and fresh Admin, QA Manager, assigned/unassigned QA, area-only
workshop, line-only workshop, and revoked workshop persona probes. Independent
security review must report zero Critical and zero Important findings before
production apply and again before the final completion claim.

## 12. Principal risks

1. **SECURITY DEFINER bypass:** an old wrapper can ignore new RLS. Mitigation:
   generated function inventory, exact ACL/definition review, and low-role SQL
   probes against every Source-bearing RPC.
2. **False QA denial from projections:** 26 live projection rows are missing.
   Mitigation: Source owner/support is canonical; projection is repaired and
   monitored but not read as authority.
3. **Workshop overgrant from labels:** area/line labels repeat. Mitigation:
   include normalized department in every grant/match and never guess aliases.
4. **Fabricated factory scope:** canonical hierarchy is empty and Source has no
   factory. Mitigation: no factory feature in this release; add it only with a
   real Source dimension and migration.
5. **Revocation race:** progress could resolve stale evidence. Mitigation:
   shared lock order and locked writer-time authorization, plus concurrency
   tests.
6. **Stale browser data:** cached dashboard can outlive a relationship.
   Mitigation: transactional authorization revision, fresh watermark before
   rendering protected snapshots, fail-closed refresh.
7. **Partial catalog/projection update:** old writer reports per-item failures.
   Mitigation: one transaction, no partial success arrays, stable lock order,
   and exact protected-row assertions.
8. **Mutable legacy permission mapping:** the reviewed baseline grants direct
   authenticated mutation on `vmp_legacy_action_map`, which feeds `muc_quyen`.
   Mitigation: fail RED until exact owner-only ACL/RLS is installed while
   preserving the reviewed `muc_quyen`/`duoc_phep` SECURITY DEFINER paths.
9. **Non-object Source leak:** nav currently exposes global datasets.
   Mitigation: both UI closure and manager-only server/RLS checks.
10. **Production partial rollout:** linked SQL files commit individually.
   Mitigation: immutable exact artifacts, read-only preflight, expand-first safe
   stop, transactional enforce file, postflight before frontend, forward-only
   recovery.
