# VMP scope and verification discipline

## Keep narrow changes narrow

- Treat the user's stated acceptance criteria as the scope boundary. Do not add adjacent features, redesign authorization architecture, or audit unrelated screens without explicit approval.
- For a small UI or permission change, inspect and modify only the directly affected UI, API/RPC boundary, authorization rule, and tests.
- Start with targeted unit tests and one targeted E2E proving the requested user flow. Run typecheck and build before release.
- Do not automatically run broad E2E groups or system-wide regression suites for a narrow change. Run a broader gate only when the changed shared boundary materially requires it or the user explicitly requests it.
- If a broad or pre-existing test outside the requested surface fails, record it and return to the requested work. Do not open a debugging loop for that unrelated failure.

## Authorization changes

- Keep server-side authorization fail-closed and verify the exact changed role/resource/action matrix.
- Database authorization changes require targeted migration tests plus production preflight/postflight. This does not authorize a whole-system permission audit.

## Time and token control

- Prefer one primary planner and at most two bounded parallel workers on files with independent ownership.
- Do not repeat completed analysis or rerun passing gates unless relevant code changed.
- Status updates should report only new evidence, the current blocker, and the remaining ETA.
- When the requested behavior is passing its targeted gates, proceed to the authorized delivery step instead of expanding verification scope.
