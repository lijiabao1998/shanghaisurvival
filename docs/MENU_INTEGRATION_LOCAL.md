# Menu integration local follow-up

This work follows the independent engineering request, not the seven-project read-only report.
Remote writes remain blocked: create_tree was retried once with the new task authority and explicitly denied. No alternative transport, new remote branch, merge, deployment or Actions execution was attempted.

## Implemented locally
- One settings controller/dialog shared by title menu and paused play. Title launcher is added only after assets/map are ready, never during loading.
- Title context uses Back to start and hides/guards save-return; gameplay context preserves save-failure-safe return.
- Native overwrite cancellation retains three-step flow (prior review fix); title settings do not dispose selection.
- Gameplay keyboard handler exits before preventDefault when not playing, allowing Tab/Space in the title menu; open settings similarly retain native keyboard navigation.
- Optional debug state exposes input/settings read-only observations for QA; no QA teleport/start or invulnerability used.
- Existing saved-game and preference keys unchanged. QA uses isolated browser contexts.

## Prepared, not executed
`web/tools/qa-menu-integration.mjs` drives actual Chromium at1366x768,390x844,360x640,844x390, with natural role/mode/departure, shared title/game settings, language/volume persistence, movement release/pause, Save & return, native confirm cancellation and Continue. It captures7 screenshots/device and records renderer resource counts/errors. Emulated viewports are not physical-device FPS/ergonomics acceptance.

Workflow template `shanghai-menu-integration-qa.yml` is locally prepared, guarded to the candidate branch, with push paths plus manual dispatch. A push trigger is needed to execute a newly added workflow without first modifying main; **publishing it would trigger CI**, so no upload is attempted while denied. It installs official Playwright Chromium, runs all local tests, previews the build and retains evidence. YAML/JS syntax checks only are not a real run.

No fresh browser screenshots or CI success is claimed. The prior Chromium socket restriction remains; no local-browser retry was used to bypass a permission denial.

## Melee integration contract
Touch Fists/Shove buttons start hidden. They appear only after the actual melee runtime emits `survivor-melee-capabilities` with enabled capabilities. `survivor-unarmed` requests a desired stance, `survivor-unarmed-state` confirms the real resulting stance, and `survivor-shove` requests a push. Desktop X uses the same guarded request. No unimplemented action is presented as active; no save ownership or equipment schema is changed by these controls. The independent melee worker owns the handlers/animation and integration remains separate.

## Local build resource observations
First128MiB-heap production attempt was externally Killed during transforming;96MiB retry hit explicit V8 heap OOM. After the final changes,192MiB-heap build succeeded. These were build resource failures, not browser acceptance. Final test results are recorded outside source in menu-integration-tests-final.log; no fresh screenshot was obtained.
