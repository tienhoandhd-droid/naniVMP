# Tổng hợp kết quả khí/hơi cho quản lý

User approved the recommended overview + area summary + filterable results table on 25/11/2026.

Add a read-only Summary tab to runs.html and a VMP navigation entry. Select one run; system, area, metric, and result-state filters apply together. Scope comes from authorized run items, with exact-version snapshots via existing historySnapshot. This also supports open runs without relying on history-list inclusion. Closed items retain their frozen revision.

Each table row is one system/form/point/metric, with all saved trials shown. Completion counts these point/metric tasks, explicitly distinct from unique physical points. Missing trials and invalid/unavailable evaluation cannot pass. Fail wins over incomplete. Comparison uses saved PQ criteria via existing TrendLimits; never recompute or change signed decisions. Non-applicable steam endotoxin is excluded. Use frozen location names; derive area only from explicit zone/area or a unique room code such as C1.A01 in saved names or canonical room-point IDs such as C1.R28-P1. Ambiguous/no match goes to Chưa xác định khu. No invented area from generic point IDs such as C4-P1. Failed partial tasks also count as unfinished; these counts can overlap. The manager view remains available when current creation config or historical chart listing fails, provided authorized run items and snapshots can be read.

Show declared performer and measurement dates from saved row metadata; show revision save time if present. Do not equate declared performer with authenticated updater. Link to source form in the selected run. Empty/loading/error states provide retry; partial failures explicitly block complete totals. Permission/session invalidation clears snapshots and prevents stale async render. No business writes, migrations, formulas, PDF or approval changes.

Responsive token-based cards, semantic tables, keyboard tabs, text status alongside color. Verify synthetic fixture flows headlessly; do not claim production login or real production data validation.
