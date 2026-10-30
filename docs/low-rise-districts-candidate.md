# Low-rise district visual candidate

This candidate re-art-directs all 476 buildings across the existing approximately 800 m Huangpu play map. It does not claim to have imported a new district or expanded the map.

- Source footprints, courtyards, OSM roads, collision, entrances, building IDs and save map IDs are unchanged.
- Rendering only interprets buildings as 2–3 storeys (up to 12 m), with deterministic warm masonry palettes, distinct roofs, upper-floor framed windows and eave lines. These are fictional art choices, not surveyed heights/materials.
- Walls, roofs and faded walls remain three batched meshes; facade details are indexed with their own building and fade with it. Occlusion uses rendered heights.
- Existing raw CMAB heights remain intact. The historical geometry preview retains its original height interpretation.
- No external textures or unlicensed assets are added.

Validation: TypeScript plus minified production build; low-rise geometry and source-preservation tests; existing regression scripts. Browser screenshot acceptance and mobile frame-rate verification remain separate and pending. Not a production release.

Further work: actual adjacent low-rise district selection from source data, street-level silhouettes/props and screenshot-led refinement. This first candidate must not be described as all district replacement work completed.
