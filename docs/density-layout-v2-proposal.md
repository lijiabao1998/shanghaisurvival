# Fictional Menghua low-rise infill proposal (not runtime-enabled)

Four original procedural 6 × 4 m footprints, 4.2 m tall; **not surveyed buildings**. Existing CMAB footprints/holes, OSM roads and save/container IDs remain untouched. Pure planner `planDensityBuildings` only returns detached objects. It does not mutate a scene, collision grid, save, or source block.

| Stable suffix (`fictional:menghua-infill:v2:`) | Center | Closest original/new wall | Closest OSM road edge | Spawn-to-footprint |
|---|---|---:|---:|---:|
|01|212, 320|3.880 m|2.653 m|15.684 m|
|02|246, 332|4.121 m|3.049 m|18.677 m|
|03|244, 348|3.309 m|2.422 m|20.190 m|
|04|260, 310|4.104 m|2.916 m|39.726 m|

Distances use exact segment intersection/minimum distance, not just corner tests. Existing building containment and map bounds are checked. Every existing footprint edge—including door edge—is buffered by at least 3 m. All OSM centerline segments use width/2 + 2 m exclusion; these widths are map estimates, not measurements. 96 m² total proposed footprint. Pure test repeats the plan, checks source immutability and stable IDs, and proves protected position points veto intersecting sites.

## Required integration boundary

- New games explicitly opt into `worldLayout:'menghua-infill-v1'`; absent remains original layout, including after reload. Never silently reinterpret old positions or relocate old saves just to fit new buildings.
- Do **not** append to `block.buildings` before original shelter/container/enemy initialization or replace `baseWallCollision`. Existing save compatibility validates container positions against this legacy base.
- New-layout movement/LOS needs an active additive collider **and solid-footprint containment**, because wall distance alone misses actors within a new building's center. Whether new buildings have traversable doors/interiors is a separate explicit design decision; no claim these four interiors exist.
- Resolve optional layout before spawning containers/enemies. Planner `protectedPoints` can reject sites around generated container/enemy/home/patrol/position points, but changing the resulting subset later would break determinism. Prefer a fixed v2 layout and spawn avoidance from its active collider; persist layout version, never touch existing entity IDs/counts.
- Keep original bounds, navigation base, safety/shelter IDs and legacy map ID fixed. Separate new city group can use existing batched visibility renderer; visible new geometry must never exist with legacy collision disabled (hide both for legacy layout).
- Geometric buffers prove local clearances, **not** complete route connectivity or actual gameplay acceptance. Before activation: compare spawn→shelter and nine room-door navigation, mobile doorway input, player/enemy movement, new-save reload, and unmodified legacy-save resume. Verify all new roofs respect occlusion.
- Current proposal is deliberately not connected to `survival.ts`, rendering, or collisions. No deployment or push performed here.
