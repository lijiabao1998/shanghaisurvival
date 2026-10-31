# V66 combat/menu completeness audit

Already implemented and retained: 12-character three-stage entry; title/pause shared audio/language settings; protected overwrite cancellation; save/continue; fists left/right; pipe/cleaver/wrench profiles; attack commitment, one-slot buffer, wall-aware swept hit and contact-only hitstop; shove/recoil and collision-safe retreat. Existing deterministic tests cover all weapons, dual-hand ownership, rifle support hand, stamina, save schema, thin walls and low-FPS windows.

Actual remaining gaps addressed in this candidate:
- Lethal targets previously vanished instantly. Reuse the existing mesh for a bounded 480ms fall, then hide it; dead gameplay state and kill credit are immediate. Repeat damage on a dead target is ignored. No mesh/material allocation or corpse persistence. Restore/new-game clears transient pose/timer, legacy death remains dead.
- Native browser evidence previously covered left fist only. Expand all four sizes to natural walking beyond helper Talk radius, left and right fist (16 each), stance restoration and pipe (45), lethal hit, shove, and save/continue with unchanged equipment. Sparring positions and health are explicitly debug-arranged; player movement/attacks/menu are native inputs, not simulated outcomes.
- Save quota failure previously had only DOM-unit coverage. Add a labelled desktop browser storage-fault injection and verify clicking Save & return keeps the paused session and previous snapshot, then restore storage and save normally.

Resource guards: death uses existing meshes, no new allocations; equipment ownership and snapshot schema untouched. Four-size resource counts, error capture and frame sequences remain recorded. CI software-renderer FPS is not physical-device acceptance. Native full-world encounters, physical touch/audio/GPU performance and subjective animation feel are still distinct acceptance work, not implied by fixtures.

Candidate branch only. Never merge or deploy without specific approval. Do not bypass any remote-write denial.
