# Character candidate — review only, no deployment

Base: main `27ed3fc`. Twelve unchanged character IDs, height/build inputs, elbows/knees and weapon mounting transforms. The Taipei reference was read-only: `src/npc/human.ts` faceless white egg head with no hair. Shanghai retains its own palette, trades and existing procedural animation.

Distinct occupational silhouette cues: guard cap/radio/reflective straps; rider helmet/delivery pack; hardware leather apron/tools; nurse coat/medical pouch; teacher cardigan/satchel/books; stall apron/head scarf; driver peaked cap/tie/epaulettes; barber dark apron/shears/comb; electrician hard hat/tool belt; pharmacy green vest/name badge; student striped tracksuit/backpack; chef double-breasted coat/toque.

No face, eyes, nose, mouth, hair, brand logos, extra inventory or occupation bonuses. Wardrobe details are decorative only. Each rig batches all static clothing pieces into 10 articulated meshes, one shared vertex-colour material, 2,772–3,276 vertices. No texture dependencies or per-frame clothing allocation. These are budgets, not physical-phone FPS claims.

Menu: real one-time rig portraits reuse the existing renderer and restore its state; no additional WebGL context. Four occupation categories plus all, then game mode, then confirmation. Back preserves selection; existing-save continue is independent. Loading reflects map response, real geometry work and first render, with error/retry and reduced motion; no fake percent.

Review-only `tools/build-character-review.mjs` creates the twelve-model contact sheet using actual game rig and locomotion/melee pose functions; not part of production entrypoints. Static pose samples demonstrate articulation, not a claim of animation smoothness or melee integration acceptance. Dedicated Ubuntu workflow captures 1440 and 390 viewports and verifies staged navigation, new game, resume and failed fetch.

Integration with parallel melee work: no changes to `melee-motion.ts` or `rig-motion.ts`; `survival.ts` changes limited to imports, start loading guard, menu and bootstrap loading. Reconcile with melee state/animation/debug edits rather than overwrite that file wholesale. Main and production remain untouched.
