# Multiple sampling points on one monthly chart

User asks all sampling points of one system and same sample/test type together. Authorized local UI change; no database writes, imports or deploy. Retain existing VMP shell and calculation/printing/source data.

Design: system → form → metric+unit → points (default all). One shared monthly SVG, independent point/trial/occurrence series; no averages or mixed units. Empty month stays a gap. Checkbox legend identifies codes/names, enables show/hide and keyboard focus highlights one point; hover titles provide precise values; table remains full selected data with exclusions visible. Single-point shortcut retained. Many points require a bounded scrollable legend and horizontally scrollable chart on mobile with legible axis labels. All points initially visible, no silent top-N.

Alternatives considered: only one point fails requested comparison; automatically averaging changes numerical meaning; many per-point charts fails shared-chart requirement. Use the shared chart with optional filtering.

Primary owns sequential implementation: runs.js/html/css and targeted unit/browser tests. Pure series grouping first RED tests: distinct points with identical months/trials, null/uncertain gaps, duplicates retained, other system/form/metric/unit excluded. Then minimum UI grouping/legend. Browser tests filled multiple points, toggle/reset/focus, data table, empty selection, all seven widths and axe. Existing runs harness provides scoped workflow regression; no broad unrelated E2E. Run targeted units, typecheck/build/budget and source/dist/HTTP integrity. Private real-imported evidence may be replayed read-only locally without server mutations; never commit it.

Independent terra reviewer after code/test checkpoint, readonly targeted five-file diff versus private before snapshot. Primary inspect findings and rerun only affected checks. Rollback: copy owned before files from private snapshot; no schema rollback. Update CPC1 feature10/state/guide with changed interpretation. Keep unrelated pending code and release/LongMon artifacts untouched. No push/commit required in local-review phase.
