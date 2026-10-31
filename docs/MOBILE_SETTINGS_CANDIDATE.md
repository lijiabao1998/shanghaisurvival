# Mobile controls and in-game settings candidate

Base: production source `411f2d6fb3c4cbb74d647a70223e8588db776593`.

## Concrete comparison
Defend Taipei at `739c6c7f6d482afcae986d5e563dae75b1b488ed`, `src/ui/style.css`:
https://github.com/lijiabao1998/defendtaipei/blob/739c6c7f6d482afcae986d5e563dae75b1b488ed/src/ui/style.css
Its joystick is 130px and bottom 52px + safe-area in portrait. Shanghai used 116px and bottom24px, placing its center approximately35px lower. Candidate aligns portrait size/offset; compact landscape remains100px with bottom28px + safe-area. Both sides retain safe-area padding.

## Settings
In-game menu via Escape / touch menu / desktop Menu button pauses simulation and releases held controls. Resume clears inputs. Save & return reloads only after successful sandbox save; quick mode does not write sandbox. Tab focus remains inside dialog and keyboard defaults remain available. Settings are **not** shown during loading animation.

Preferences key `shanghai-survivors-preferences-v1` is independent of campaign snapshots. Storage-denied/full cases retain session settings and warn. Language options Traditional Chinese / Simplified Chinese / English cover settings, staged selection, core touch controls and needs labels. Character names/stories, detailed item/narrative text and fictional Shanghai signs are not fully translated; the settings explicitly disclose the scope.

Volume and mute control a shared Web Audio master gain for new original synthesized footstep/swing/loot/UI-preview cues. There were no audio tracks previously; this does not claim background music. Gesture-gated AudioContext, no network samples, no automatic playback. Cues do not alter enemy hearing or game rules. Suspended/hidden/paused gameplay produces no new gameplay cues. Missing audio support is non-fatal.

## Start flow
See STAGED_CHARACTER_MENU.md: three steps,12 characters in3 groups, existing save Continue shortcut, final explicit checkbox before replacing existing sandbox. No storage changes on Back or intermediate steps.

## Visuals
See menghua-stock-detail-candidate.md: historical named Menghua street photo comparison, narrower chamfered curbs and heterogeneous shelf goods / drawers; no collision/layout/save changes. Interiors are original approximations, not a documented real shop interior survey.

## Verification boundaries
Local TypeScript, production build and Node geometry/rule/runtime tests run. Browser-specific `tools/qa-touch-controls.mjs` could not start local Chromium: process_singleton socket() Operation not permitted / crashpad database failure. No current screenshot, actual touch/speaker/device performance validation or visual acceptance claimed. No Shanghai CI is triggered. This candidate requires specific PR approval for merge/release.

## Review correction (local follow-up)
Review https://github.com/lijiabao1998/shanghaisurvival/pull/9#discussion_r4428324898 correctly identified that start() disposed the staged menu before the native sandbox overwrite confirmation. Disposal now happens only after confirmation succeeds. Cancelling/repeated cancelling leaves the departure step and existing save intact; accepting a later retry disposes once. The confirmation now accurately warns that this browser's Shanghai sandbox save is replaced, rather than promising a separate official save is retained. `test-start-confirm-cancel.mjs` executes the actual guard/disposal boundary including cancel/retry/resume/quick/dead-save paths. This follow-up is local only until authorized remote update; it does not retry the denied merge.
