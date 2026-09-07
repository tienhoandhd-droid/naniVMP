# VMP joyful desktop upgrade

User authorizes autonomous design, implementation and deployment. Preserve original business data, labels, permissions, deadline semantics and the current 60-day window. Base: production 86d8745684e52f8698e54a0b7b77ca93683dae54.

## Design decision
Considered a full visual rewrite, a decorative-only refresh, and an additive interaction upgrade. Choose the additive upgrade: retain the established Lotus identity, brighten shared surfaces and accents, and make Long Môn an intentional dual-view experience. Full rewrite risks established data workflows; decoration alone misses the requested functionality.

Long Môn exposes two labeled, keyboard-operable buttons: “Theo ngày” (default) and “Bơi tự nhiên”. The first retains chronological anchoring and all present semantics. The second reuses exactly the same eligible fish, statuses, counts, permissions and detail action, but disperses them organically across a desktop pond. Hide timeline guides in artistic mode and explain that position is artistic, with exact deadlines still available in details. Do not introduce a second source of truth or write data. Remember only the display preference; unavailable browser storage must not break rendering.

Use existing WebP art with native CSS decoration and motion, no new dependency or large raster. Organic placements must be deterministic per ID and invariant to input ordering, finite and bounded for empty/sparse/dense sets. Keep every fish reachable; preserve table view on Timeline. Pause all scene motion with a visible button, on hover/focus interaction, on hidden document and under reduced-motion preference. At desktop use the available width; at mobile retain the established horizontally scrollable pond.

Shared UI: retain readable Vietnamese typography, semantic error/status colors and all labels. Introduce fresh ivory/rose/jade surfaces, subtle warm highlights, clearer navigation selection and focus without reducing contrast, altering permissions or obstructing tables. Support light and dark themes.

Security/operations: sanitize client error payloads before both deduplication and RPC submission; remove URL query/hash values and credential/email patterns while retaining useful error categories and route names. Retain all rate limits and missing-RPC fail-safe behavior. Test with fabricated secrets only. No DB migration needed. Add the new browser behavior test to the release gate, retain existing quality requirements.

## Acceptance and release
Unit RED/GREEN for display parsing, organic layout identity/bounds/order stability, payload sanitization. Browser checks for switching, count/deadline parity, details, storage failure, pause/reduced motion, keyboard use, overflow and theme screenshots at desktop/mobile. Run typecheck, unit suite, build, drift, bundle budget and existing release gates relevant to shared changes. Independent review before release. Deploy only verified commit with unchanged remote head, no force push; verify Actions and live asset. Rollback by reverting release commit(s), followed by the same Pages workflow; source production base preserved above.
