# Native MFA rollout

MFA is voluntary to enable and mandatory for data access once a native factor is verified. Existing roles, PQ scope and closed-record locks remain in force. Supabase hashes passwords with bcrypt and rate-limits Auth endpoints; a browser delay is not a security boundary. Users enable TOTP on their own device. Never enroll or reset an account on their behalf.

## Cutover

1. Rehearse new migration `20260929160000_opt_in_mfa_guard.sql` on a fresh restore; run `tests/sql/mfa-session-guard.sql`, actual PostgREST aal1/aal2 requests, and existing PQ read-only permission matrix.
2. Independent security review of frontend, migration, test evidence and current Auth settings. Record absence of an existing pre-request hook. Existing production verified factor count at initial audit: zero.
3. Build and verify the frontend. Hold deployment until step4 installs and verifies the server guard. Never expose enrollment on production before the guard is applied.
4. Under existing release authorization, apply the new migration once in a transaction with migration-ledger entry. Preserve all record/profile counts/hashes. Confirm Data API hook returns normal data for existing unenrolled accounts, anon denial remains, and schema/role settings match the rehearsal.
5. Auth settings: raise new-password minimum to 12 (frontend and server), retain native rate limits/TOTP. Do not silently change any existing password or account. CAPTCHA is an alternative requiring a registered provider/site key, not a necessary addition when native TOTP is used. Leaked-password checks may require a paid project plan; do not claim enabled unless verified.

## Rollback and recovery

Before anyone enrolls, reviewed web rollback to base 683caaa is compatible with the guard. Once accounts enroll, keep the MFA-capable frontend: old frontend cannot complete TOTP. Prefer a forward fix. Never remove verified factors to make a rollout pass.

Emergency guard rollback on a disposable rehearsal or an explicitly authorized incident: reset only `authenticator`'s `pgrst.db_pre_request` when it equals `public.vmp_mfa_pre_request`, notify reload config, drop the four `vmp_mfa_required` policies and the two new functions. Restore the exact prior setting if it was not empty. Rollback removes the new security boundary and must not be presented as MFA protection. Existing role/resource policies are never dropped.

Lost authenticator: route to authorized IT identity verification and Supabase account recovery; password reset alone does not bypass MFA. Native enrollment confirmation can invalidate other sessions. QR/manual secret is transient; do not log or screenshot real enrollment secrets. Already issued signed Storage URLs remain usable until their pre-existing expiry; the new guard prevents issuance/download with an insufficient user session, not retroactive bearer-URL revocation.

## Evidence limits

SQL policy tests prove the database rule, not every hosted gateway. Actual HTTP PostgREST, browser native-auth fixtures and filled live read-only smoke checks are recorded separately. Production verification must not brute-force real credentials or create synthetic qualification records.
