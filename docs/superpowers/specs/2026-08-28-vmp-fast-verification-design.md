# Thiết kế VMP fast verification

## Mục tiêu

Giảm thời gian và lượng context của vòng RED/GREEN, fix/re-review và kiểm tra
cục bộ mà không hạ chuẩn chất lượng. Tầng tăng tốc chỉ chọn và tổ chức các gate
đã có; final exact-SHA verification, các gate bảo mật và review độc lập vẫn chạy
đầy đủ.

## Phạm vi và rollout

Triển khai theo hai tầng có thể kiểm chứng độc lập:

1. **Fast gates và evidence:** chọn gate theo bề mặt thay đổi, thực thi qua
   registry allowlist và xuất receipt nhỏ có hash của raw log.
2. **PostgreSQL template cache:** tạo template bất biến cho DB test cục bộ,
   clone một database mới cho mỗi case và chứng minh kết quả tương đương đường
   uncached trước khi tích hợp runner.

Skill cá nhân chỉ điều phối các interface trong repository. Mapping đường dẫn,
lệnh thực thi, cache key và quyết định pass/fail phải nằm trong repository để
được version-control, test và review.

Không thay đổi production, Supabase migration, GitHub release workflow,
`package.json`, production build/deploy hoặc các lệnh final gate hiện hữu.

## Kiến trúc

### 1. Changed-surface selector

`scripts/fast-gates/surfaces.json` ánh xạ glob đã review sang gate ID có cấu
trúc. `scripts/fast-gates/select.mjs` thu thập đầy đủ committed, staged,
unstaged, untracked, file bị xóa và cả hai phía của rename. Mọi rule trùng khớp
được hợp; không được dùng first-match.

Selector trả một object có schema ổn định:

```text
Selection {
  mode: focused | full_fallback
  baseSha
  headSha
  changedPathsSha256
  manifestSha256
  matchedRuleIds[]
  reasons[]
  gates[]
}
```

Selector phải chuyển sang `full_fallback` khi không resolve được base, đọc diff
thất bại, manifest rỗng/sai, gặp đường dẫn chưa biết, hoặc thay đổi chính
selector/manifest/package/workflow/build/auth/Supabase/SQL infrastructure.
`--final` luôn từ chối focused selection.

Manifest chỉ chứa gate ID, không chứa shell command. Tên file lạ không thể tạo
command injection.

### 2. Gate runner và evidence

`scripts/fast-gates/run.mjs` ánh xạ gate ID sang registry argv cố định và chạy
bằng `spawn`, không dùng `eval` hoặc shell text từ manifest. Registry bảo toàn
Node `24.18.0`, typecheck, full unit, bốn nhóm mock E2E theo đúng thứ tự hiện
tại, build, DB và accessibility gate.

Mỗi invocation tạo raw log ngoài repository trong thư mục chỉ owner truy cập và
một receipt nhỏ gồm:

```text
schemaVersion, runId, base/head SHA, dirty-tree hash, Node version,
selection mode/reasons/hashes, exact registered command argv,
UTC start/end, monotonic duration, exit status,
raw-log SHA-256, raw-log byte count, cleanup result
```

Receipt không chứa environment values, URL, UUID, email hoặc log excerpt. Lỗi,
interrupt hoặc cleanup không hoàn chỉnh phải tạo receipt failed/incomplete bằng
atomic rename; không trường hợp nào được ghi PASS nếu command thất bại.

### 3. PostgreSQL template cache

`scripts/test-db-cache/manage.mjs` quản lý template cục bộ cho PostgreSQL 17.
Nó tái sử dụng guard của `parse-five-role-local-db.mjs`: chỉ loopback, port
`54322`, database `postgres`, user `postgres` và cluster đã kiểm tra.

Cache key gồm:

- cache format version;
- PostgreSQL major 17 và local cluster identifier;
- sealed-fixture digest thực tế;
- danh sách có thứ tự của preparation/migration paths và content hashes.

Cache miss xây staging database, áp ordered inputs đúng một lần, tính post-state
digest rồi seal thành template bất biến. Cache hit phải kiểm lại cluster, PG
major, owner, template flags, fixture digest, ordered-input hashes và quyền của
sidecar. Mỗi test luôn clone target disposable mới và chạy profile validator
trên clone trước khi trả success. Không test trực tiếp trên persistent template.

Ba chế độ:

- `off`: chạy nguyên đường hiện tại;
- `read`: hit thì clone, miss thì fallback chính xác sang đường uncached;
- `read-write`: rebuild trên miss, nếu không thể cache thì fallback uncached.

Connection hoặc target không an toàn phải abort, không được fallback. Final gate
tiếp tục gọi đường hiện tại với cache `off`.

QA rights là proving ground đầu tiên. Source profile chỉ được tích hợp sau khi
Task 1 Source được review chấp nhận; profile dừng trước Source expand/enforce và
trước fixture rollback riêng của từng run.

## Skill cá nhân

Skill `vmp-fast-verification` được cài ở `~/.codex/skills/` sau khi interface
repository ổn định. Skill chỉ:

- chọn hoặc yêu cầu base SHA;
- gọi fast-gate command trong repository;
- đính receipt nhỏ thay vì raw log khi đủ bằng chứng;
- tạo delta review package cho fix round, giữ primary anchor và finding IDs;
- nâng bề mặt unknown/high-risk lên full gate và full review;
- bắt buộc final exact-SHA full gate và reviewer đúng cấp rủi ro.

Skill không chứa VMP path mapping, SQL, cache logic, command string hoặc tự diễn
giải PASS/FAIL.

## TDD và tiêu chí an toàn

### Selector/evidence

Test phải chứng minh:

- known path chọn đúng focused gates; nhiều rule được hợp và deduplicate ổn định;
- unknown, manifest rỗng/sai, missing base, self-change, workflow/package/config,
  auth/Supabase/SQL đều chọn full fallback;
- staged, unstaged, untracked, deleted và rename đều được thu thập;
- odd filename không thể inject command;
- `--final` không thể focused;
- Node khác `24.18.0` bị từ chối;
- command fail/interrupt không thể tạo receipt pass;
- raw-log hash và byte count khớp file đã đóng;
- secret sentinels không xuất hiện trong receipt.

### DB cache

Test phải chứng minh:

- key đổi khi PG major, fixture digest, migration content/order hoặc preparation
  SQL đổi;
- target không local bị từ chối trước mọi `createdb`, `dropdb` hoặc `psql`;
- metadata thiếu/hỏng/sai permission/sai cluster không bao giờ là hit;
- post-state digest mismatch từ chối clone;
- mutation ở một clone không ảnh hưởng clone kế tiếp;
- concurrent builder không publish template một phần;
- uncached, cold-cache và warm-cache có schema/function/ACL/RLS digest, PASS
  marker multiset, exit semantics và cleanup-survivor kết quả giống nhau.

## Benchmark và điều kiện bật

Chạy tuần tự trên cùng commit và local PG cluster, xen kẽ thứ tự A/B:

- 10 uncached runs;
- 10 cold rebuild runs;
- 10 warm-hit runs;
- ít nhất 20 historical diffs để đo selector recall so với full gate.

Ghi p50/p95 cho setup, validation, clone, migration, test và cleanup; đồng thời
ghi failure/flake count, PASS-marker multiset, post-state digest, survivor count,
receipt bytes và raw-log bytes.

Chỉ bật fast path mặc định khi có zero false negatives, zero stale-state
acceptance, evidence tương đương và p50 giảm đáng kể. Không suy diễn token saving
từ thời gian; báo riêng số byte context/log được cắt.

## Review checkpoints

1. Selector/evidence: TDD, primary inspection và Terra review.
2. Cache engine/QA profile: TDD, cold/warm/uncached equivalence và Sol security
   review.
3. Source integration: chỉ sau Task 1 acceptance, focused review rồi full Source
   gate.
4. Personal skill: RED baseline scenario không có skill, GREEN scenario có skill,
   validator và independent forward-test.
5. Final: full exact-SHA gates và Sol whole-change review.

Delta package chỉ được dùng trong fix rounds. Primary và final review của
migration, ACL/RLS, auth hoặc concurrency luôn đọc full diff.

## Rollback

Fast path là opt-in. `cache mode=off` hoặc gọi lệnh hiện hữu trực tiếp sẽ phục
hồi ngay hành vi cũ. Key thay đổi làm template cũ không còn reachable. Prune chỉ
được xóa template local đã resolve, đúng prefix, cluster ID và owner; correctness
không phụ thuộc prune.

Không sửa hoặc tái sử dụng mock build artifact cho production deploy. Không tái
dùng database test đã bị mutation làm template.
