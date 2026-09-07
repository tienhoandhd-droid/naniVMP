# Long Môn painting and operational follow-through

User authorizes implementation and deployment. Latest priority: a distinctive ngư đồ with the whole painting and every fish visible without scrolling; retain date and organic modes, source data, permissions, and record opening.

## Architecture and ownership
- Keep authoritative race model and activity records unchanged. Presentation maps all fish into a bounded scene. Date mode preserves chronological ordering; organic mode uses stable natural composition. No sampling or omitted fish.
- Fit the scene to the actual remaining viewport using measured available space, with a contained complete background; compact surrounding controls on the timeline screen. Preserve global navigation and detail modal behavior. Keep pause/reduced motion and a searchable accessible way to locate/open records when fish are dense.
- New generated background: Vietnamese silk/ink pond, jade water, ivory silk, restrained lotus and vermilion details around margins, quiet center, no baked-in fish/text/data. Existing species represent real records. Versioned WebP asset.
- UI worker owns LongMonRace.tsx, longMonPresentation.ts, long-mon-race.css, TimelinePage.tsx, timeline-specific App.tsx integration and associated targeted tests. Primary owns assets, operational scripts/docs, integration and release. No database migrations or authorization edits.
- Monitoring worker may independently own a read-only availability checker, its unit tests and scheduled GitHub workflow. No outbound messages or webhook actions. Native Actions failure status only.
- Primary handles backup sequentially: authenticated read-only PostgreSQL export, encrypted private local storage, disposable local restore drill. Never restore to production. State accurately the limitations of local scheduling/storage.

## Implementation and checkpoints
1. UI RED: browser assertions fail on whole-scene visibility at desktop sizes, dense data and mobile; test search parity and record opening. Implement bounded layout and natural composition, then GREEN.
2. Generate and inspect artwork, save versioned optimized asset, integrate with complete-frame composition.
3. Monitoring RED: status failures/timeouts/unsafe URL handling, then implement minimal read-only checker and schedule. No sensitive response logging.
4. Backup: verify tooling/version and source identity; create encrypted snapshot outside repo, verify archive and restore in disposable local environment; document recovery and retention. No claims of offsite backup or storage-object coverage without proof.
5. Primary inspect all diffs; separate reviewer checks UI accessibility, containment, unchanged semantics, operational safety. Resolve material findings.
6. Fresh targeted browser tests, unit tests, typecheck, build/budget/drift; broader gates only for shared shell changes. Deploy through existing Quality and Deploy workflow, inspect public release and record evidence.

## Dependencies and rollback
Generated art is independent; UI consumes one agreed versioned path `public/art/monitoring/long-mon-ngu-do-silk-v1.webp`. Shared dist build/preview remains sequential. No overlapping worker files. Revert release commit to return to 6c862ce; remove local timer to disable backups, disable monitoring workflow if needed. Preserve previous artwork and original records. Advanced report approval and personal MFA require a separately defined workflow/authenticator and are not silently enabled.

## Verified implementation outcome
- A complete generated 1774×887 painting is fitted to the remaining viewport. Date x-coordinates still come from the authoritative model; organic school uses stable phyllotaxis, scaled for density. All original records remain native interactive buttons. Search has accessible results, empty feedback, Escape dismissal, and original-record opening.
- Compact timeline topbar preserves the route and data timestamp; global filters, painting/table switch, and all three monitoring destinations remain available. Desktop first-view checks include 1366×768 with 50/150 fish, plus 1440×900 and 1920×1080 resizing. Mobile checks verify the contained complete image and ordinary 11-fish interaction; dense mobile target separation is not guaranteed, so search/table remain useful.
- Clean RED was captured for the original minimum-height/navigation layout against the new first-view assertion. A later full accessibility gate caught missing monitoring navigation; restoring it as compact tabs made the full 20-check gate pass.
- Local verification: 829 unit checks passed (1 pre-existing skip), 9 Python backup safety checks passed, targeted Long Môn browser checks passed, 20 axe checks passed, 29 shell checks passed, typecheck/build/design-drift/bundle budgets passed. Dist ~3.85 MB, initial JS gzip ~169 KB.
- Independent security/operations review and separate UI review completed; identified endpoint, key-format, private-placement, publication, and navigation issues were corrected before release.
- A real encrypted production logical dump was decrypted and restored into 94 tables in a disposable local PostgreSQL 17 database; every table was readable and the disposable database was removed. No production restore or schema mutation. Reviewed scripts were installed outside Git; daily systemd timer is active and its first service run succeeded.
- Monitoring workflow performs bounded GET-only checks of the public page, entry JavaScript and the exact deployed Supabase Auth health endpoint. External notification recipient and offsite backup storage are not configured. Deployment and live receipts are recorded separately under the workspace release-evidence directory after the GitHub release gates finish.
