# VMP quality upgrade — 29 September 2026

## Authority and baseline

User requests research, plan and full implementation on the latest synchronized VMP. This includes execution; no second design approval is needed. Work only in the existing linked worktree MA-NGUON-HIEN-TAI. Local HEAD and remote main are 683caaa77d1699768a1e5772710e801440267954. Existing release receipts identify this SHA and real-web verification. Preserve unrelated untracked September 23 plan.

## Evidence and design decision

Several supplied findings are hypotheses rather than observations. Existing code already has report SVG charts, drilldowns, filters, Excel/PDF/HTML export, lazy routes, font preloads, compressed artwork, error boundaries, session refresh, focus styles, theme tokens and axe tests. Audit these before changing them. Confirmed source defects include clickable report table rows without keyboard activation, report selects without explicit associated names, login errors losing Supabase status/code, and no MFA experience. Runtime measurements determine remaining contrast/reflow/performance changes.

Keep the Lotus Pearl visual system and reporting calculations. Alternatives considered: full visual rewrite (large regression surface); adding isolated cosmetic patches (inconsistent); targeted improvements to shared primitives plus verified route defects (selected). Do not invent another chart package or modify printed qualification forms.

## Architecture and acceptance

1. Reports: native keyboard-operable drilldown controls inside semantic tables; explicitly named year/department/period selects; concise reading/export guidance; announced filter/export status. Keep calculations, exported rows, charts and permissions intact. Existing filters and export are verified rather than rebuilt.
2. Shared UX: labels/tooltips for navigation and search; named busy states; consistent focus/contrast; measure light/dark at 1440, 768, 390 and 320 CSS pixels and text enlargement. Decorative icons are hidden from assistive technology, informative images named. Reflow must not clip controls; wide tables may scroll in their own region.
3. Auth: preserve Supabase password hashing and rate limiting, surface 429/network/invalid-credential errors correctly, block concurrent requests. Research native TOTP enrollment/challenge with explicit enrollment by the account owner; no automatic password reset or enrollment. Default voluntary enrollment unless user chooses mandatory admin rollout. Any claim of MFA protection must distinguish frontend flow from backend enforcement. Production Auth settings need verified access and a before/after receipt; never treat a browser cooldown as brute-force protection. Shared authorization and database work remain sequential under primary planner.
4. Performance: collect reproducible baseline and after evidence; retain route splitting, lazy export dependencies and caching of hashed assets. Optimize a demonstrated loading bottleneck, not a hypothetical Lighthouse score. Record Lighthouse environment and distinguish lab results from field metrics. No fabricated FCP or score guarantees.
5. API/session: verify expired session, transient network failures, access refresh and retry behavior without losing user data or creating unauthorized writes.

## Boundaries and rollback

No historical reimport, effort_days update, identity/role change, record state change, approval or signature. No qualification formula/criteria/print renderer changes. Never rerun applied migration 20260929120000. Headless only. Tests use populated fixtures with external writes blocked. Production read-only verification must use existing approved access. Rollback frontend by reverting reviewed commits compatible with existing server; new security settings, if authorized and applied, require their own recorded rollback and review.

## Research sources

- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/ — text contrast, keyboard, resize/reflow, names and status messages.
- Supabase Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
- Password hashing/security: https://supabase.com/docs/guides/auth/password-security
- Native MFA: https://supabase.com/docs/guides/auth/auth-mfa
- FCP: https://web.dev/articles/fcp
- Lighthouse variability: https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md

## Verification and delivery

RED/GREEN tests for changed behavior; targeted existing regressions; axe with actual populated routes; keyboard, mobile, zoom, console/network checks; typecheck/build/bundle budget. Independent security and final review. Inspect all delegated diffs and rerun relevant gates. Record local, pushed, production applied and deployed separately in root PROJECT-STATE. Existing release authorization persists, but do not claim deployment before exact artifact and real-web checks.
