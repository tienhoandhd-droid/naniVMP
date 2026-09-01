# Receipt — production public schema restore

- Captured at: `2026-09-01 15:01:08 +07:00` (Asia/Bangkok)
- Source commit: `5543bebd6b524954f4a92f416a646d469cc6e1d7`
- Schema file: `supabase/schema.sql`
- Schema SHA-256: `e7589a6ee851eaa715377af5b199b30898ada53c6c197ad8a0b3c62fd7d83862`
- Schema size: `995920` bytes (`24477` lines)
- Production PostgreSQL version: `17.6`
- Restored tables: `63`
- Restored functions: `321`
- Restored policies: `66`
- Restore marker: `PASS SCHEMA RESTORE tables=63 functions=321 policies=66`

The restore ran against a fresh disposable PostgreSQL 17 database. The database
was dropped by the smoke script and its verified disposable container was
removed immediately afterward.
