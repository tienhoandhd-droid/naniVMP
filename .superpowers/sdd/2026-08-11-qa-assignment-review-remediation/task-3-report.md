# Task 3 report — full SQL fixture và state-aware harness

## Trạng thái

DONE_WITH_CONCERNS

Code/fixture đã GREEN bằng full-file outer rollback trên current repaired DB.
Concern còn lại là không có dedicated clone URL để chạy success path của
`--forward-test`; theo brief, bằng chứng thay thế là manual explicit
`BEGIN ... ROLLBACK` và không được diễn giải thành dedicated-clone proof.

## Historical RED và root cause

Historical RED tại assertion enforced RLS:

- RLS visible count thực tế: `0`, expected `1`.
- Visible code: `CCTB01/2026.01-OQ`.
- Hidden code: `CMTB1001/2026.01-OQ`.
- Cả visible và hidden đều có canonical path-count `0`.
- Visible assignment active/source `equipment_manager` vẫn tồn tại.
- Core rights fail-closed với reason
  `Ngoài phạm vi bộ phận/xưởng/khu vực/line canonical`.

Vì fixture chỉ điền `scope_departments`/`access_areas` rồi cưỡng bức
`enforced`, production RLS từ chối là đúng. Không nới RLS, rights function,
policy hay preflight.

## Thay đổi fixture

### Enforced RLS

- Chọn visible/hidden active cùng department, khác area, có đủ area+line và
  đều path-count `0` trước fixture.
- Tạo một factory UUID cố định, hai area UUID và hai line UUID khớp chính xác
  object visible/hidden.
- Gán chỉ factory/area/line path visible vào performer `view_only`.
- Assert cả visible và hidden có path-count đúng `1` trước khi bật enforced.
- Giữ nguyên expected visible count `1` và hidden/nonexistent indistinguishable
  assertion.
- Cleanup assignment/person, rồi hierarchy child-first line → area → factory;
  outer transaction vẫn rollback toàn bộ.

### Timeline fixture phát hiện nhờ full-file run

Sau khi block RLS cũ qua, full file lần đầu dừng muộn hơn ở timeline fixture:
`equipment_scheduler` nhận `allowed_fields=[]`. Fixture này cũng đổi sang
non-QA trong enforced nhưng chỉ có legacy scope.

Fix tối thiểu: chọn item đã resolve đúng một catalog path và điền UUID
factory/area/line tương ứng cho performer. Production authorization giữ nguyên.

## Phase và completion contract

Full SQL phát đúng một lần các marker:

```text
ITEM_PERMISSION_SQL_PHASE_SCHEMA_CONTRACTS
ITEM_PERMISSION_SQL_PHASE_CANONICAL_SCOPE
ITEM_PERMISSION_SQL_PHASE_ENFORCED_RLS
ITEM_PERMISSION_SQL_PHASE_QA_ASSIGNMENTS
ITEM_PERMISSION_SQL_PHASE_SOURCE_RESOLUTION
ITEM_PERMISSION_SQL_TESTS_COMPLETE
```

Harness đăng ký và chạy toàn bộ
`tests/sql/item-permission-source-writer-auth.sql` trước full test, trong cùng
outer transaction, với marker riêng
`ITEM_PERMISSION_SQL_PHASE_SOURCE_WRITER_AUTH`.

## Harness state/safety

`scripts/test-item-permissions-sql.sh` không còn migration glob hoặc
`.env.local` fallback.

- `--final-state`: yêu cầu duy nhất `SUPABASE_DB_URL`, không nhận migration,
  yêu cầu mode `preview` và cả hai writer đã hardened bằng canonical principal.
- `--forward-test`: nhận đúng một explicit path, chỉ chấp nhận migration
  `20260811120000_harden_canonical_source_writers.sql`; từ chối generic
  `SUPABASE_DB_URL`, yêu cầu riêng `ITEM_PERMISSION_SQL_DEDICATED_DB_URL`, mode
  `preview`, repaired signatures tồn tại và definitions còn pre-111200.
- Hai URL cùng được đặt, thiếu mode, wrong migration, live/generic forward input
  đều fail trước kết nối/migration với exit `64`.
- Script không tự nhận diện hay tuyên bố một URL là clone an toàn; trách nhiệm
  cung cấp dedicated URL vẫn thuộc caller.
- Một psql session chạy full source-writer file và full item-permissions file
  trong `BEGIN ... ROLLBACK`, với connect/statement/lock/idle timeouts.
- Exact phase/final/rollback markers và đủ bốn checksum before/after là success
  gate; `ON_ERROR_STOP` ngăn sliced success.
- Whole-row checksum bao phủ performers, source objects, plan items và
  assignments.
- Temp checksum tables luôn qualified `pg_temp`, được dọn ở đầu/cuối để an toàn
  với backend pool giữ session; không bao giờ drop unqualified/public table.

## TDD / verification evidence

### Historical RED

Được giữ từ diagnosis trước Task 3: enforced RLS `0` visible với path-count
`0/0`, failure đúng tại assertion expected `1`.

### Intermediate full-file evidence

Sau fix RLS đầu tiên, full run đi qua block cũ `1946`, rồi dừng tại timeline
fixture với error `item_field_forbidden` cho `scheduled_at`. Transaction lỗi tự
rollback. Điều này chứng minh full-file execution bắt regression mà slicing đã
che.

### Final GREEN

Manual run được gắn nhãn rõ:

```text
ITEM_PERMISSION_SQL_MANUAL_CURRENT_REPAIRED_DB_NOT_DEDICATED
```

Một psql session đã chạy exact `111200`, full source-writer auth, full
item-permissions, exact sentinel, explicit rollback và postflight checksum.
Kết quả exit `0`.

```text
ITEM_PERMISSION_SQL_TESTS_COMPLETE
ITEM_PERMISSION_SQL_ROLLBACK_CONFIRMED
```

Whole-row checksums trước/sau giống hệt:

| Bảng | Count | MD5 |
|---|---:|---|
| `vmp_item_assignments` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `vmp_performers` | 7 | `ed7fb3f12ffeaef9c321df8629e0acd7` |
| `vmp_plan_items` | 461 | `990abf39e2a2e576cea1d84c50f77b16` |
| `vmp_source_objects` | 272 | `dee67ba61bbec4b6abe3df9dc2e548ec` |

Fresh read-only postflight sau rollback:

- mode `preview`;
- hai writer vẫn pre-111200 (`false|false`), chứng minh migration không persist;
- counts performers/source/plan/assignments `7|272|461|0`;
- deterministic RLS hierarchy fixture residue `0`;
- source-writer auth user/performer residue `0|0`;
- migration ledger vẫn `7|20260704110201`.

Các static/safety checks:

- `bash -n scripts/test-item-permissions-sql.sh`: exit `0`.
- `git diff --check`: sạch.
- Missing mode, ambiguous URLs, generic live forward và wrong migration đều
  exit `64` với error riêng.
- `--final-state` trên current pre-111200 DB bị từ chối đúng, không tạo false
  success.

## Self-review và scope

- Chỉ sửa `scripts/test-item-permissions-sql.sh` và
  `tests/sql/item-permissions.sql`; consume source-writer auth đã commit.
- Không sửa migration, ledger, docs, UI hoặc production SQL definition.
- Không có DB change persistent; mọi fixture/migration probe nằm trong outer
  rollback.
- Không chạy sliced SQL để đưa ra completion claim.

## Concern / verification còn cần

Khi có dedicated clone URL, chạy success path thật:

```text
env -u SUPABASE_DB_URL \
  ITEM_PERMISSION_SQL_DEDICATED_DB_URL=<dedicated-clone-url> \
  scripts/test-item-permissions-sql.sh --forward-test \
  supabase/migrations/20260811120000_harden_canonical_source_writers.sql
```

Sau khi `111200` được apply hợp lệ ở Task 5, chạy `--final-state` bằng explicit
`SUPABASE_DB_URL`. Không dùng kết quả manual current-DB ở trên để tuyên bố đã có
dedicated-clone safety.

## Pre-live Minor cleanup

Review trước live chỉ ra hai Minor hợp lệ và đã được xử lý trong commit tiếp
theo Task 3:

1. Database URL được truyền bằng `psql --dbname="$db_url"`, nên giá trị bắt đầu
   bằng `-` không thể bị `psql` diễn giải thành option.
2. Header của full SQL mô tả đúng hai mode hiện tại: final-state không replay,
   hoặc repaired pre-111200 với exact forward migration `111200`; không còn mô
   tả glob migration cũ.

TDD option-parsing evidence:

- RED trước fix với `SUPABASE_DB_URL=--version`: output chạy
  `psql (PostgreSQL) 16.14`, chứng minh URL bị parse thành option.
- GREEN sau fix với cùng input: exit `2` ở bước kết nối database name, không in
  version/help và không đi vào DB test.

Fresh verification sau cleanup:

- `bash -n`: exit `0`.
- Missing mode, ambiguous URL và generic live forward gates: exit `64` đúng
  contract.
- Full manual current-repaired-DB outer rollback với migration `111200` hiện tại:
  exit `0`, có `ITEM_PERMISSION_SQL_TESTS_COMPLETE` và
  `ITEM_PERMISSION_SQL_ROLLBACK_CONFIRMED`.
- Whole-row counts/digests trước/sau vẫn đúng bốn giá trị đã ghi ở bảng trên:
  assignments `0:d41d8cd98f00b204e9800998ecf8427e`, performers
  `7:ed7fb3f12ffeaef9c321df8629e0acd7`, plan items
  `461:990abf39e2a2e576cea1d84c50f77b16`, source objects
  `272:dee67ba61bbec4b6abe3df9dc2e548ec`.
