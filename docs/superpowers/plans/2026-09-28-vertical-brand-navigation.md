# VMP identity and responsive vertical navigation

Goal: user wants original CPC1HN logo and stylized VMP Monitor / Hệ giám sát thẩm định, desktop vertical navigation, mobile horizontal navigation. Continue local-only.
Architecture: same static HTML/CSS and tokens. One rail contains system navigation and existing BM navigation, beside main at >=1024px; stacked horizontal navigation below header at smaller widths. Original logo asset reused with intrinsic dimensions and alt text. Compact masthead adapts existing VMP lettering, no raster watermark behind fields. V/Q team retained in rail identity. No new dependency or animation.

Primary owns all shared HTML/CSS/workspace.js edits sequentially. App/gas/home logic, IDs, APIs, permissions, PDF and DB remain unchanged. Desktop rail scrolls within viewport when needed, keyboard Up/Down matches orientation; mobile Left/Right preserved. Source order rail before main, skip link retained.

- [x] Before code: snapshot current9files, add browser expectations for desktop vertical system/BM controls, mobile horizontal controls, Up/Down keyboard, logo loaded and masthead visible; observe RED.
- [x] Implement HTML wrappers and branding on library/steam/gas, CSS responsive rail; adapt existing keyboard/reveal helper for vertical orientation.
- [x] Verify18populatedforms across7widths, both themes, keyboard/focus, pointpicker, no horizontal page overflow, mock load/save/error/PDF handlers. Inspect screenshots.
- [x] Independent read-only terra review of snapshot/current scoped files; primary handles findings.
- [x] Fresh unit/typecheck/build/budget; protectedhash/unchangedlogic and source/dist/HTTP integrity. Update CPC1state and localguide. No push/deploy/production write.

Rollback: restore changed UI files from private vertical-brand-ui snapshot; remove new rail.css and references. Leave all unrelated pending release files intact.

Final evidence: original-logo RED; additional1440x720 End visibility RED before reserving header space in rail maxheight. Browser126populated/7width/11axe0violations, keyboard and shortviewport green. Unit5,typecheck,build,budget pass; protected7hashes and5source/dist/HTTP files plus original logo match. Screenshots inspected. No production actions. Evidence private vertical-brand-ui-20260928.
Independent terra reviewer vertical_brand_review reports no concrete remaining issue in final scope; no reviewer edits.
