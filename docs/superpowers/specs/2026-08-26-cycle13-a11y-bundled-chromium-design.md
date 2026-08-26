# Cycle 13 Accessibility Bundled Chromium Design

## Problem and impact

Exact-SHA CI run `32920155241` passed static quality, the sealed visual
contract, and the full mock/catalog/admin/shell/aesthetic/atelier E2E step.
Accessibility then failed all five cases before axe could scan anything.
`playwright.a11y.config.ts` selects no channel when `CI` is set, so Playwright
looks for `chromium_headless_shell-1234`. The reviewed workflow deliberately
installs only full bundled Chromium with `--no-shell`.

This is test infrastructure only. Application, interface, authorization,
database, baseline PNG, seal, workflow, package, and production bytes do not
change.

## Authorized correction

Set the accessibility configuration channel to exact literal `"chromium"`
for every environment. This matches the sealed visual runtime and the browser
already installed by CI. Do not install headless shell and do not fall back to
system Chrome.

A new isolated unit contract imports the real accessibility configuration
with `CI` both set and unset and requires the effective channel to remain
`"chromium"`. The test must fail against the current conditional configuration
before the one-line implementation is made.

## Verification and release

After focused and full unit checks, runtime and baseline contract checks, an
independent GPT-5.6 Sol review must report zero critical and zero important
findings. Push one forward correction commit, then dispatch `deploy.yml` once
for that exact SHA. Require static quality, full mock E2E, accessibility 5/5,
and visual 39/39. Never rerun `visual-baseline.yml`.

Only after this preflight succeeds may the existing Cycle 13 one-shot official
matrix and fast-forward release sequence resume. Stop on any new gate failure,
remote drift, or review finding outside this scope.
