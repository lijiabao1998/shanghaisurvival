# Shanghai lilong identity details — candidate only

Builds on the owner-accepted low-rise rendering, without changing source map data, building IDs, entrances, collision, save schema, item distribution or weapons.

## Exterior

475 eligible existing buildings gain an original procedural stone-framed shikumen-inspired entrance with stepped lintel, red-brick piers/mortar, unlettered blue enamel plate, and restrained upper-floor drying rail/cloth. These are fictional art interpretations, not surveyed facades or fabricated street addresses. Existing actual OSM street names remain the location labels. All details join their building's existing wall batch and fade with it; the city still uses three meshes. The added facade budget is 108,264 vertices across the full map.

## Interior

The existing safehouse has a wooden bed/blue quilt/pillow, low cabinet/enamel washbasin and stool, merged into one 270-vertex mesh (9 component boxes). Placement checks all corners against the real footprint and leaves the central 1.2 m doorway lane clear. Objects are decorative and do not secretly add collision. They become visible through the existing inside-building roof-removal mechanism.

A real “看看屋內” button collapses the stock panel while retaining “開啟物資面板” and “返回街區”; this is available to players, not a screenshot-only trick. It zooms to an 8 m vertical domestic view (portrait retains at least 6 m horizontal framing), hides the large street HUD and adds a warm shadowless interior light. The original player street zoom is not modified; expanding the panel or exiting restores it. New games clear inspection state, and inspection is not persisted in saves. The old circular pad is replaced by the actual concave footprint-minus-courtyards floor. It does not pause/unpause a different game mode or change saves. Leaving the shelter clears the compact state. Debug state adds only read-only mode/shelter/stock/room-view fields for natural entry, storage, exit and reload verification.

## Verification boundary

TypeScript and production build pass. 22 regression scripts pass locally, including all actual footprints, deterministic rendering, batch budgets, inside-footprint furniture and clear doorway. No browser acceptance or deployment is claimed. Required next: desktop and mobile street/entry/interior screenshots; natural entry and exit; storage transfer and reload/continue; inspect that furniture is genuinely visible and no menu traps occur. This is not all district work completed, nor imported new districts.

The first street/interior screenshot round exposed tiny furniture at street camera scale; the close-view correction is local and awaits another browser screenshot round. This document does not claim that corrected view has been accepted.

## Room-area visibility correction

The second actual screenshot showed neighboring roof `cmab_327821_0` covering furniture despite the player's own ray being clear. Room inspection now adds a precomputed grid of 35 valid points inside the safehouse near the furniture and fades/hides any building intersecting any of those parallel camera rays. It retains the same three batched meshes and index buffers. Closing the panel's room view or leaving the house restores normal single-player-ray occlusion, including when player coordinates are unchanged. The focused regression checks this exact real-map neighboring roof, legal inside-only points, mode-cache invalidation and restoration. All 23 local test scripts pass; corrected screenshots remain pending, not accepted.

## Atomic inspection transition

The third screenshot round showed the neighboring roof cleared on desktop but still present in the mobile close view. The UI previously changed projection immediately while roof-index updates waited for 0.1 simulated seconds; animation dt is capped at 0.05, so a fixed wall-clock wait cannot guarantee those updates on a software-rendered slow frame. Inspection toggles and shelter exit now synchronously update projection, focus-ray indices, camera position and lamp before an immediate render. This closes the code-level stale-geometry window rather than merely extending a screenshot delay. The old capture did not record mobile room fade IDs, so the captured artifact's exact timing cannot be reconstructed; the next browser run must record those IDs and visually confirm the correction.
