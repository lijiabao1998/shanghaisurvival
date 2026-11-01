# Shanghai staged character selection

## Reference
Read-only source comparison on 2026-10-30:
https://github.com/lijiabao1998/defendtaipei/blob/739c6c7f6d482afcae986d5e563dae75b1b488ed/src/core/main.ts
`setSelectionStep` uses Survivor → Preferences → Ready, a persistent previous button, and defers new-game creation until departure. Shanghai uses the same progressive disclosure principle, not Taipei's occupation/game mechanics.

## Implemented presentation
- Original 12 Shanghai character IDs and all their gameplay data remain unchanged.
- Three occupation groupings (4 characters each): neighbours, city workers, care/supplies. These are UI categories, **not new character skills/classes**.
- Step 1 chooses a character; step 2 shows sandbox/quick preferences; step 3 shows identity, mode and save consequence before departure.
- An existing compatible continuation button remains at the top, usable without selecting a new character.
- Selecting cards/categories, changing mode and going back do not call `start` or touch save storage.
- New sandbox departure over a compatible save requires explicit checkbox acknowledgement. Going back or changing mode clears acknowledgement. Independent quick challenge does not overwrite sandbox.
- The existing `start` callback is called only on final departure; existing load callback stays intact.
- Main step/category/confirmation labels support Traditional Chinese, Simplified Chinese and English via the injected translation function. Character names/jobs/stories remain their original text; this is not full narrative localization.
- 44px minimum category/back targets and a two-column four-card roster, with mobile spacing. This is coded layout, not claimed physical-device ergonomic acceptance.

## Verification boundary
`node tools/test-staged-character-menu.mjs`: passes group coverage, pure state guards and actual controller interactions against a minimal DOM double (continuation, no premature launch, consent/reset/back, quick mode, language, dispose). TypeScript passes.
No current actual browser screenshot or physical-device touch acceptance is claimed. No CI invoked. No source publish, PR merge or deployment performed by this subtask.
