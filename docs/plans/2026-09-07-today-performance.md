# Today header and initial-load performance

User requests color/navigation recommendations, actual performance improvements, and removal of the last-edited label on Today. Existing authorization covers implementation and deployment. Keep the current palette implementation; recommend ivory/plum/jade and quieter navigation states without another broad visual redesign.

1. Primary owns App.tsx and Layout.tsx. Hide Topbar last-edited only for view=today, stop passing updatedLabel into Today. Remove unused Topbar minute tick; preserve data refresh and day rollover in App.
2. Lazy-load TodayCommandCenter via existing retry loader, retain memo and existing Suspense/auth boundaries. No API/database changes. Update source-contract test to permit lazy import; enforce same scope/permission props.
3. RED header unit and browser contract; measure existing initial bundle (169.2 KiB gzip JS). GREEN targeted tests, unit suite, typecheck/build/budget. Browser check Today label absent with original description, navigation to/from Today, access and accessible loading. Independent reviewer checks diff and scope, primary resolves material findings.
4. Deploy existing GitHub gates; verify public compiled build and health. Rollback one release commit; no production data mutation.

## User steering: implement a natural, calm, refined visual identity
The user explicitly asks for careful visual execution. Extend this release with a restrained shared-shell refinement, not new content or illustration assets. Keep existing typefaces and brand illustration, but reduce background image/grain intensity behind reading areas. Ivory surfaces, plum ink/active navigation, jade-tinted hover, champagne hairline accents. Create dedicated navigation tokens for light/dark so business success/warning/danger colors remain unchanged. Preserve sidebar widths, all controls, access filtering, route semantics and the Long Môn contained-frame geometry. Keep focus explicit, all navigation text >=4.5 contrast, reduced motion, and existing desktop/mobile reachability.

File ownership: visual worker owns only lotus-tokens.css, lotus-shell.css and monitoring.css; primary App/Layout/performance tests, browser worker owns its one new test. Independent states permit two workers. No new dependency, font download, raster asset or animation loop. Visual review screenshots Today/Overview/LongMôn, light/dark, desktop/mobile before final release. Primary inspect diff and rerun full axe and shell due shared CSS changes. Roll back one release commit.

Performance refinement: primary also owns main.tsx and new TodayCommandCenterPage.tsx, a CSS-loading adapter; move the 32 KiB Today stylesheet out of the eager entry and load it alongside the lazy component. Preserve direct CSS-free Today module imports for existing SSR permission tests. Browser verifies stylesheet availability after route load.

Today now participates in existing desktop intent prefetch (hover/focus only, disabled for Save-Data/mobile), avoiding a click-time waterfall while retaining deferred loading. Dedicated static route budget is 40 KiB gzip including CSS and shared route delta. Primary owns routePrefetch.ts and budget contracts.

## Verification and review
- RED: Today header contract reproduced unwanted last-edited text; Today intent-prefetch gate initially returned false. Both now pass. Existing visual baseline was updated to the explicitly reduced artwork opacity.
- GREEN: 833 unit tests passed, one existing skip; final focused prefetch/budget suite 8/8. Today browser confirms 18 fixture rows, no Today resource before navigation, loaded CSS with the lazy route, retained content, removed last-edited text, and navigation away/back. Long Môn 150-fish first-view checks still pass.
- Full axe 20/20 and shell/navigation 29/29 passed. Light/dark Today desktop and mobile screenshots inspected, no mobile horizontal overflow. Selected nav foreground/background pairs meet 4.5:1 in both themes. Icon stroke was explicitly paired with selected foreground.
- Typecheck, build, design drift and bundle budgets pass. Initial CSS 177.8→154.5 KiB (~13% smaller); critical JS gzip 169.2→165.9 KiB. Today route delta is 8.6 KiB gzip including its CSS, below the new 40 KiB limit. These are byte savings, not an asserted user-latency percentage.
- Independent review found no critical/important blocker. No database, access rules, source records, deadline logic or automatic refresh changes. Release/live evidence will be stored outside the repo after GitHub gates complete.
