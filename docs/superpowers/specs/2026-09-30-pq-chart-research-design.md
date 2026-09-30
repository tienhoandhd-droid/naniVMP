# PQ charts: redraw after rejected local previews

The user rejected a28f376 and asks to research and redraw. Earlier permission to implement the recommended design and open local persists. Visual acceptance remains the user's decision; technical checks do not establish acceptance.

## Research and chosen direction

- [Government Analysis Function](https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-charts/): natural content width, readable horizontal labels, restrained gridlines, accessible tables and scope outside the graphic.
- [Plotly box plots](https://plotly.com/javascript/box-plots/): distinguish original observations from the summary box by positioning points beside the box.
- [Matplotlib boxplot gallery](https://matplotlib.org/stable/gallery/statistics/boxplot_demo.html): filled quartile boxes, clear median/whiskers, limited decoration.

Compared approaches: another side-by-side cosmetic pass retains cramped categorical axes; a new general chart library adds weight within the existing 6 MB budget and requires a new accessible interaction adapter; full-width vertically aligned SVG plots give all sampling locations more space while preserving the audited statistical adapter. Choose the third. Implement a substantive redraw, not a palette-only change.

## Composition

Each form/metric/unit in one selected saved run gets one white analytical card. Its header states metric, unit, form, saved run/version, source/plotted counts and official PQ versus statistical counts. The Individual chart and Boxplot appear as two full-width rows with identical categorical positions and Y-domain. Remove decorative chart numbers and independent rounded half-width panels. Use navy/blue marks, lightly filled boxes, quiet horizontal gridlines, and red dashed saved PQ rules. A pale exclusion band is drawn only when all plotted points share a complete known saved criterion; it denotes the numerical region beyond that criterion, not a QA decision.

Keep exact values on Y; horizontal displacement only prevents dots occluding each other. Deterministic circle packing preserves order and all repeated observations. In Boxplot, dots for n>1 sit beside the box, preserving a clear median and quartile body. n=1 stays a single point and median with its count, no artificial box. Dynamic minimum width accommodates dense duplicates/long/many sampling codes with internal horizontal scrolling; mobile must not shrink text or create page overflow.

Common PQ text lives in an always-visible heading caption including unit, rather than colliding with numbers. Point-specific PQ captions occupy a dedicated axis footer row while segments remain at exact Y. Missing/incompatible/uncertain criteria never create rules or bands. Hover, touch and keyboard focus show the raw observation in a nearby safe text tooltip and preserve the existing live inspection fallback. Escape dismisses the tooltip. No third chart type, averages, temporal connecting lines, or inferred control limits.

## Unchanged contracts

Keep CPC1BoxStats type7/1.5IQR, saved snapshot decimal precision, official verdicts, form/metric/unit/run/version isolation, source/provenance and uncertain rows, pending/error/access guards, closed locks, history, evaluator, PDF/forms, DB/Auth and QA unchanged. PQ failure uses red diamond; statistical outlier uses amber ring, independently. No new dependency or external browser request. No push/deploy.

## Evidence and delivery

Add meaningful RED/GREEN coverage for deterministic non-occluding dots, clear box/point separation, vertically aligned full-width plots, common versus segmented captions, real-sized 17-location/multiple-trial and duplicate scenarios, exact-value tooltip focus/touch/Escape, responsive axes and unchanged verdict/source contracts. Reuse targeted three-system E2E/axe, typecheck/build/drift/budget. Independent reviewer examines implementation and screenshots. Build into a new private directory and replace only task-owned 4173 after verification. Keep a28f376 artifact as rollback. Update both PROJECT-STATE files and open the concrete local result for the user's review.
