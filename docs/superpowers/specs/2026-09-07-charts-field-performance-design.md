# Refined charts and field performance

User authorizes creative chart redesign and real-user performance instrumentation, optimization, and previously authorized deployment. Preserve source facts, calculations, drilldown, filters and permissions.

Chart direction: jade completion, slate-blue validation, plum protocol, muted ochre report; reserve terracotta for overdue. Dedicated light/dark chart tokens, visible values and shape/text cues, quiet grids, aligned horizontal comparisons where useful. Avoid brand-wide recoloring and heavy chart libraries. Existing year/calendar and statistical semantics remain accurate.

Performance: official web-vitals CLS/INP/LCP, bounded document-level reports, sanitized allowlisted initial screen and coarse device category only. No DOM, URL query/hash, email or business content transmitted. Authenticated active sessions only; protected table and admin/QA aggregate RPC with sample counts and 7-day p75. Missing backend must disable silently, never interrupt work. Dashboard distinguishes measurements still pending from zero and small samples from representative evidence.

Optimize only measured/reproducible work in chart rendering/loading; preserve lazy Overview and use targeted before/after browser evidence.

## Research and final constraints
- https://github.com/GoogleChrome/web-vitals — use official buffered LCP/INP/CLS collection; page lifetime metrics, not invented per-tab Web Vitals.
- https://www.datawrapper.de/blog/colors — reserve semantic colors and supplement with visible values; separate chart palette from decorative brand surfaces.
- Authenticated ingestion stores internal user_id for rate accounting, disclosed in the UI; no email, content, DOM, raw URLs or search strings. Admin/QA see aggregate cohorts, including small samples explicitly marked as preliminary.
- Limits: ten batches per page lifecycle, 120 reports/hour/account and 300/day/account; 30-day daily retention; summaries last7days with one latest metric/page. Client values are diagnostic only, not trusted business records.
- Overview comparison uses same-origin horizontal lanes, while calendar cycle and statistical calculations remain unchanged. Report screen/export use matching semantic palettes.
