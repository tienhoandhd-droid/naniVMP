# Qualification workspace — UX audit and implementation plan

User authorizes autonomous audit/design/implementation under their detailed quiet-luxury product brief. Local review first, no GitHub push/deploy. Scope only Thẩm định thực tế (demo); existing VMP shell, Long Môn, server formulas/RLS/Auth, source templates/font/PDF rendering remain unchanged. Primary owns architecture/tokens/form markup/UI binding and integration. Catalog worker owns only index.html/home.css; independent reviewer checks UI/functionality afterward.

## Audit
- Existing stack: VMP React/Vite shell links to guarded static HTML+plain JS module. index.html/home.js is a searchable18form catalogue; steam.html/app.js and gas.html/gas.js implement5+6+7forms. Shared cloud backend uses VMP Auth and8 RPCs. Persisted snapshots/PDF are server controlled.
- Cascading legacy styles/theme/vmp-theme override one another; plum background and serif headings do not fit latest request. Small bold labels and shadows compete with data.
- Steam side navigation and gas top navigation differ. Form selectors show onlyBM codes. Gas listbox has no arrow-key behavior. Sticky footers contain6competing buttons and can obscure fields.
- Catalogue uses decorative equipment drawings, oversized card intro and many small cards. Search supports meaningful names and Vietnamese accents and should be preserved.
- Empty/loading/error flows exist but need deliberate styling, readable form navigation labels, accessible dialogs/focus and honest busy states.

## Design / tokens
Light only, optimized for long qualification data entry; no dark toggle until there is a justified workflow. User colors background#F7F7F5/surface#FFFFFF/subtle#F1F1EF/ink#111214/secondary#666A70/tertiary#92969C/borders8/14%. Tertiary only decorative/disabled, normal secondary text must meet4.5. One primary accent deep teal#245B50; statuses semantic green/red/amber with text, no decorative extra colors. Sans family existing self-hosted Be Vietnam Pro400/500/600 (Vietnamese, consistent VMP, no extra download) plus system mono forIDs. Remove serif. Title32–40,body16,line-height1.6,caption13. Scale4/8, radiuscontrols10/cards14, borderline surfaces, no gradients/glass/decorative motion. Use12/8/4column layout primitives and max1280wide with readingwidth720 where appropriate. Data-entry spacing24–40; catalogue sections64–96, not marketing-sized forms.

## Architecture and ownership
- Replace vmp-theme.css with shared tokens/base controls/layout/form primitives/feedback/gate styles. Remove obsolete stylesheet links rather than stacking more overrides; leave unused original files untouched as reference/rollback.
- Add workspace.js for presentation-only native disclosure navigation on small screens, supplementary-actions menu, keyboardEscape and busy feedback. No network/data/calculation code.
- Primary: steam.html/gas.html, app.js/gas.js only labels/semantics/no-results feedback; preserve allDOM IDs/input names/events/rawvalues and calculations. New common header/system-nav,260pxside navigation, open form sections, single primaryCTA, file actions disclosure. Native details avoids custom overlay/focus trap. Metadata remains available but formula version can be disclosed.
- Catalog worker: index.html/home.css only. Tokens fromsharedCSS; restrained editorial introduction,3system rows, searchable18form list, concise workflow instructions, preservehome.jsIDs/deep links/authgate/scripts. No invented reports/statistics.
- Existing home.js search/auth logic unchanged. PDF/backend/migrations hashes recorded before/after.

## Task states
Catalogue primarytask selectsystem/form; CTA Mở hệ thống, secondarysearch. Search no-results clear. Workspace primarytask measureddata entry; calculateprimary, save/printsecondary, import/export/listsecondary disclosure. Data/status never fabricated. Error summary/inline preserved, busy explicit, empty records with nextstep. Navigation never discards data beyond existing confirmations. ReadonlyQA staysserver-enforced.

## Verification / RED-GREEN / rollback
1. Capture baselinevisual evidence and protectedfilehashes. Add isolated browser test with synthetic fixtures and real entry scripts, mocked backend only, no production writes. RED: namedBMnav, mobile disclosure, supplementary actions and tokenstyles absent. Guardroutes tested separately byexisting unit tests.
2. Implement tokens, catalog worker and primary entryworkspace sequential sharedCSS. UI-onlymockadapter stubs calc/load/save/PDF toexercisevisualstates and payload preservation; evidence explicitly distinguished from realbackend acceptance donepreviously. Test filledall18forms and7widths360/390/768/1024/1280/1440/1920, errorretention,keyboard,readonlyT3, busy/focus/empty dialogs, reducedmotion; axe serious/critical/contrast checks oncatalogue+3workspaces.
3. Fresh typecheck/build/budget, moduleunit tests; verify protectedPDF/Auth/SQL hashes identical. Headless authenticated local realbackend smoke3filledforms/evaluate only afterreadonlyDBpreflight; no newbusinessrecords. User localserver serves rebuiltassets.
4. Independent reviewer at leastterra for UX, no overlapping implementation writes. Primary inspectdiff/recheckfixes/screenshots and recordactualevidence. No claims of formalGMPvalidation/fullWCAGcertification. No release changes outsidemodule.
5. Rollback onlynewUI files frombaseline762c8ac; leave unrelated4pendingreleasefiles untouched. Update PROJECT-STATE/localguide, deliver localURL forreview.

## Reference principles, not copied layouts
- https://linear.app/now/how-we-redesigned-the-linear-ui — hierarchy/alignment, less chrome, stress tests.
- https://vercel.com/geist/introduction — restrained reusable system.
- https://www.raycast.com/ — focused native-like controls; no decorative glass added to this light workspace.
- https://stripe.com/ — modular content hierarchy and clear actions.
UI-UX Pro Max returned editorial/minimal recommendations; its genericpink/typepairing is intentionally superseded by userpalette and existingVietnamese font. No new framework or animationdependency.

## Reproducible UI acceptance
`CPC1_UI_FIXTURES=/private/fixtures CPC1_UI_OUTPUT=/private/evidence node scripts/check-qualification-ui.mjs`
The directories must exist. Fixtures contain `config.json` (the exported configuration shape: settings, gas_settings) and `steam.json`, `air.json`, `nitrogen.json` (version1 synthetic drafts). Keep fixtures/evidence outside Git. The checker intercepts every request, serves the actual public UI and fonts from this checkout, supplies a mock backend and rejects outside origins. It performs no Supabase request. Never treat its stubbed calculations/save/PDF callback as server or issued-PDF acceptance.

Added regression: keyboard Enter on desktop navigation used to lose focus because render replaces buttons. Native browser event dispatch can run microtasks between capture and target listeners; restoration is deferred to the next task, then selects the new current button. Mobile focuses the new heading; records-dialog close returns focus to a visible disclosure. RED recorded in private keyboard-red.log; same interactive checker verifies the fix.

## Verification result (28 September 2026)
11 targeted unit tests, typecheck, build and bundle budget pass. Mock browser covers all18 populated forms ×7 requested widths and axe on4screens. Real local VMP session tested3 populated/evaluated forms without save attempts; DBrecord/revision/audit/request counts stayed0 and45privateassets remain. Protected8hashes unchanged. Review evidence/screenshots/logs held privately, not Git. Local8882 serves rebuiltassets. No push/deploy; unrelated pending release files untouched. User UAT pending.
