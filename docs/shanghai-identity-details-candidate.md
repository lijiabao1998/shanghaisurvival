# Shanghai lilong identity details — candidate only

Builds on the owner-accepted low-rise rendering, without changing source map data, building IDs, entrances, collision, save schema, item distribution or weapons.

## Exterior

475 eligible existing buildings gain an original procedural stone-framed shikumen-inspired entrance with stepped lintel, red-brick piers/mortar, unlettered blue enamel plate, and restrained upper-floor drying rail/cloth. These are fictional art interpretations, not surveyed facades or fabricated street addresses. Existing actual OSM street names remain the location labels. All details join their building's existing wall batch and fade with it; the city still uses three meshes. The added facade budget is 108,264 vertices across the full map.

## Interior

The existing safehouse has a wooden bed/blue quilt/pillow, low cabinet/enamel washbasin and stool, merged into one 210-vertex mesh (7 component boxes). Placement checks all corners against the real footprint and leaves the central 1.2 m doorway lane clear. Objects are decorative and do not secretly add collision. They become visible through the existing inside-building roof-removal mechanism.

A real “看看屋內” button collapses the stock panel while retaining “開啟物資面板” and “返回街區”; this is available to players, not a screenshot-only trick. It does not pause/unpause a different game mode or change saves. Leaving the shelter clears the compact state. Debug state adds only read-only mode/shelter/stock/room-view fields for natural entry, storage, exit and reload verification.

## Verification boundary

TypeScript and production build pass. 22 regression scripts pass locally, including all actual footprints, deterministic rendering, batch budgets, inside-footprint furniture and clear doorway. No browser acceptance or deployment is claimed. Required next: desktop and mobile street/entry/interior screenshots; natural entry and exit; storage transfer and reload/continue; inspect that furniture is genuinely visible and no menu traps occur. This is not all district work completed, nor imported new districts.
