# Shanghai street and interior candidate, 2026-10-30

## Reference and scope
- Shanghai official city-tour guide, Yuyuan Road (2024-05-08): https://english.shanghai.gov.cn/en-CityTour/20240508/7cdcd7347c3249fcb0bd6731d8646aa8.html — plane trees and mixed shopfronts are design cues, not a claim that Menghua Street is Yuyuan Road.
- Shanghai official shikumen guide (2023-12-11): https://english.shanghai.gov.cn/en-ScenicSpots/20231211/98e70b4d4c54401895104e4dee9f16d8.html — compact lanes, exposed brick, stone gates, tiled roof and domestic rooms.
- Historical Menghua Street photo report: https://web.shobserver.com/sgh/detail?id=912507 — historical visual context only, not a current street survey.

All new geometry is procedural original art; no source photograph is redistributed. Existing bundled building footprints and roads remain unchanged. Furnishings are fictional interpretations, not measured real interiors.

## Implemented candidate
- Daylight/twilight/night visual palettes and readable night exposure, visible phase label; existing 12-minute clock and night enemy rules retained.
- Raised pedestrian paving, seams, curbs, tree pits and plane-tree silhouettes only along sufficiently wide roads; narrow service lanes and crossing paths retained. Lamps use emissive shades, not 48 dynamic lights.
- Three selected buildings have furniture collisions, ordinary walk-through doorways, room labels and one finite resource each. Other buildings are NOT advertised as furnished.
- Room depletion uses optional `interiorLoot` table; original container array length/order and old save schema version remain intact. New rooms never become replenishing daily caches. Inventory and depletion save atomically.

## Verification boundaries
Pure geometry, save/parser and runtime-contract tests are separate from browser screenshots. Browser time/room placement fixtures must be explicitly labelled. Candidate screenshots are not user visual acceptance or proof of production deployment. No merge or release is implied by this document.

## Detail-density iteration (following user feedback)
- Existing footprints remain unchanged: this increases visual detail density, NOT the number of buildings or playable blocks.
- Deterministic maintained / shuttered-window / weathered art states; these do not assert the real address is damaged and do not lock the original door.
- Up to three facade sides receive sills, drainpipes, AC units, shutters/boards and chipped surfaces; facade budget 300k vertices. Rooftop service boxes, vents and selected tanks remain within original footprints and join the existing hidden-roof batch.
- Three interiors receive recognizable bedclothes, domestic sink/cupboard fittings, open shelf goods and workbench tools. No added loot or changed save identifiers.
- Total city geometry remains three meshes with stable buffers. This is an engineering draw-call/geometry budget, NOT evidence of physical-phone FPS.
