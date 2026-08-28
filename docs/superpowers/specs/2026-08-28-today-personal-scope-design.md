# Today Personal Scope Design

**Status:** Approved
**Date:** 2026-08-28  
**Related design:** `docs/superpowers/specs/2026-08-28-today-action-queue-performance-design.md`  
**Related Source design:** `docs/superpowers/specs/2026-08-28-source-qa-workshop-access-design.md`

## Goal

Make the daily QA workflow personal by default without hiding the team view from
managers: QA staff opening Today see only activities where their canonical
performer ID is owner or support; QA Manager and Admin keep the team view and
retain the management actions authorized by the Source access design.

## Approved role rules

| Business role | Today default | May switch scope | Source QA/coverage management |
| --- | --- | --- | --- |
| `qa_staff` | My work today | Yes, to team view when the screen permission allows it | No |
| `qa_manager` | Team work today | Yes, to personal view when linked to a performer | Yes |
| `admin` | Team work today | Yes, to personal view when linked to a performer | Yes |
| Workshop roles | Existing authorized screen/data scope | No new authority from this change | No |

This change never derives authority from the client-side scope switch. Server
permissions and the existing screen guard remain authoritative. The switch only
narrows data already returned to the current session.

## Meaning of the two views

- **Today** is the time/action queue: overdue work, due today, due within seven
  days, and incomplete records that require attention.
- **My work** is the ownership scope: activities whose canonical
  `owner_person_id` or `support_person_id` equals the current account's linked
  performer ID.
- **My work today** is the intersection of those rules and is the default Today
  scope for `qa_staff`.
- The global My work filter outside Today continues to mean all of the current
  person's work within the selected screen and date/filter criteria.

## Scope state and URL behavior

Today gets its own explicit scope mode:

```ts
type TodayPersonScope = "mine" | "team";

function defaultTodayPersonScope(
  businessRole: BusinessRole | null,
  currentPersonId: string | null,
): TodayPersonScope;
```

The default is `mine` only when `businessRole === "qa_staff"` and a non-empty
canonical performer ID is present. It is `team` for Admin, QA Manager, workshop
roles, unresolved roles, and unlinked accounts.

The Today scope is independent from the existing global `onlyMine` state so a
QA staff member opening Today does not silently change Timeline, Overview, or a
shared URL for another screen. The existing `me=1` URL contract remains the
global My work filter. Today does not introduce a second ambiguous URL flag in
this repair. Navigating away and back during the same mounted session preserves
the explicit Today switch; a fresh session recomputes the role default.

## User interface

On Today, replace the generic `Việc của tôi` control with a scope control whose
label always describes the available action:

- Personal mode: `Xem việc cả đội`.
- Team mode with linked performer: `Chỉ xem việc của tôi`.
- Team mode without linked performer: disable the personal action and show
  `Tài khoản chưa liên kết nhân sự; nhờ Admin nối hồ sơ.`

The Today heading/scope label explicitly states either `Việc hôm nay của tôi`
or `Việc hôm nay của cả đội`. Department and area filters remain available and
apply after the selected person scope. Clearing department/area filters does
not change the Today person scope.

Outside Today, retain the current `Việc của tôi` control. Its unlinked-account
message uses the same actionable copy and must not silently return an empty
list.

## Data flow

1. The authenticated profile supplies `businessRole` and canonical
   `user.personId`.
2. A pure Today-scope model derives the default and whether the current account
   can enter personal mode.
3. `filterTodayScope` receives `onlyMine = todayPersonScope === "mine"` and the
   canonical performer ID.
4. `isTodayActivityMine` compares only canonical owner/support IDs, including
   normalized raw RPC fields; display names are never an authorization or
   filtering fallback.
5. `TodayCommandCenter` receives the filtered activities and a presentation-only
   scope control. It does not decide roles or permissions.

## Missing identity and error handling

- A missing `personId` never falls back to name or email matching.
- QA staff with a missing link are not shown a misleading empty personal queue.
  Today uses team mode only if their existing server/screen data permission
  allows it and displays the linkage warning prominently.
- If the server later enforces a narrower QA response, the same state renders
  the returned authorized rows and the warning; the client does not attempt to
  widen the response.
- Admin performs the actual person-account link through the existing permission
  administration flow. QA Manager does not receive account-management rights,
  and this repair adds no new account writer.
- Loading and connection failures remain distinct from a valid empty personal
  queue.

## Source management alignment

The existing Source design remains authoritative:

- Admin and QA Manager may select active eligible Source owner/support QA and
  manage workshop department/area/optional-line coverage.
- QA staff may not manage those relationships. Their Source/item visibility is
  limited to Source rows where they are canonical owner or support.
- Workshop view and edit rules remain independent from the Today presentation
  scope.
- Account/role administration remains Admin-only; QA Manager receives only the
  narrow Source relationship and coverage management actions already specified.

## Testing contract

### Unit

- `qa_staff` plus linked `personId` defaults to `mine`.
- `qa_manager` and `admin` default to `team`.
- Unlinked `qa_staff` fails closed for personal matching and exposes the linkage
  warning instead of an empty-personal claim.
- Personal Today includes owner and support activities and excludes unrelated
  activities.
- Team Today retains all activities allowed by department/area filters.
- Switching or clearing Today filters does not mutate the global My work state.

### End to end

- A linked QA staff persona opens Today in one step and sees only its owner or
  support rows.
- The QA staff persona can select `Xem việc cả đội` and sees additional rows.
- QA Manager and Admin open Today in team mode and can narrow to their own work
  when linked.
- An unlinked persona sees the actionable linkage warning and no misleading
  personal empty state.
- A same-name/different-person fixture never crosses ownership scope.
- The Source management E2E continues to prove Admin/QA Manager allow and QA
  staff deny for relationship and coverage writers.

## Delivery order and rollback

1. Repair Today/My work scope first because it is the current user-visible
   blocker.
2. Run focused unit, role E2E, typecheck, build, and independent review.
3. Resume the existing Source plan sequentially from its current RED-suite
   checkpoint.
4. Do not deploy, push, merge, or mutate production as part of implementation
   without a separate explicit authorization at the release checkpoint.

The Today repair is rollback-safe as one isolated application commit. Source
database rollout keeps the expand/enforce transaction, forward-recovery, exact
SHA, and production postflight controls defined in the existing Source design.

## Status communication

Every progress update restates the active assignment list in this order:

1. Today/My work personal-scope repair.
2. Final verification of the fast test runner.
3. Source QA/workshop access implementation.

Longer optional work—database caching, 30-run benchmarking, and custom skill
authoring—remains deferred until these assigned items are complete.
