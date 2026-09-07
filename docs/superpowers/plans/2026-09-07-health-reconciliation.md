# Health reconciliation correction

**Goal:** Explain the reported 448/461 and quality-count discrepancies without changing business records or pretending the server automatically wins.
**Architecture:** Existing authorized reads and active KPI calculations remain authoritative for their stated scope. The Health comparison separates active KPI from non-active rows already present in the authorized payload; only compare totals after matching unfiltered population. Client and server quality-rule counts are separate diagnostics. No migration or external workflow changes.

## Tasks / ownership
- [x] Independent sol read-only production audit: exact year/is_active/item_state counts, status contributions from excluded rows and server/client rule differences. Aggregate-only evidence outside repository; no refresh/write RPCs.
- [x] Primary RED/GREEN pure comparison model: active448+excluded13=server461 is reconciled; nonzero true remainder stays visible; filtered/different population is not marked a data error; unlike rule sets never produce a numeric discrepancy or blanket server-authority claim.
- [x] Primary Health UI: active/non-active/server columns with clear denominator and scope labels, client/server issue counts separately; refresh re-reads authorized client data and server KPIs, loading/error states do not assert success. Pass filter state/year/refresh through App. No source records altered.
- [x] Primary quality check: an omitted email_qa field is unknown, not a confirmed missing email; explicit null/blank still raises existing warning. Unit regression preserves confirmed-warning behavior.
- [x] Targeted mocked browser: reproduce 13 non-active rows, correct counts/conclusion, refresh requests client+server, filter makes comparison unavailable, distinct rule sets and failed RPC state; typecheck/build and relevant regressions.
- [x] Independent sol review of scope math/auth refresh/unknown-data distinction; primary inspect and verify. 
- [ ] Authorized commit/pushmain, CI/deploy, public check. Rollback frontend commit only; no business-data rollback required.

## Design choices
Blindly change status values would corrupt source facts. Silently replace active KPI with broad server totals would include non-applicable work. A diagnostic excluded-count column preserves both original figures and explains the difference; unmatched population remains explicitly unresolved. Quality counts use different rules and cannot be reconciled by subtraction.

## Verification before release
- Node 24 full unit suite: 861 pass, 1 skipped, 0 failures.
- Typecheck, production build, design drift, bundle budget: pass.
- Browser contract: active + 13 non-applicable rows, true residual, filters, both-source refresh and client/server read failures: pass.
- Independent sol review: approved; requested failed-client-reload coverage is included.
- Production audit: all five KPI gaps arise from 13 not-applicable rows; the 130/351 quality totals use different rule sets. No business data changed.
