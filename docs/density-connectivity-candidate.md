# Infill + nine-room geometric connectivity

Local candidate check on 2026-10-30; NOT browser/touch traversal or visual acceptance.

`cd web && node tools/test-density-connectivity.mjs`

The test constructs the actual original wall collider, fictional infill wall collider, and all nine furniture colliders. A .36-radius actor has a checked central corridor in every original room and outside-to-inside access at each of the four new building doors.

For connectivity from the original map spawn, bounded A* uses a .25 grid and checks each edge with collision samples spaced at most .06, including exact endpoint attachments. All thirteen door-exterior targets have routes, within a local box expanded 60 units beyond the spawn/target hull. This is not simply a bounding-box gap check. Route metrics/counts and fixed bounds are recorded in `density-connectivity-evidence.json`; distances are grid-path lengths, not measured real-world routes.

Legacy gate comparison: 3,744 grid samples around the new buildings match original walls plus original-three furniture exactly. There are 1,504 sample witnesses where new walls block new-layout actors but not legacy actors; all 18 new-room furniture centers likewise provide witnesses. Unknown layout strings also stay legacy. The test additionally checks current runtime source retains the opt-in wall gate and three-versus-nine slice. This is structural/unit evidence; actual loaded old-save behavior still needs browser regression.

Original building IDs/source data and the exact three-room regression fixture remain unchanged. The four infill buildings' `createCityVisibility(..., true)` uses three city meshes plus one merged runtime floor: four draw calls, 2,148 unique geometry vertices versus an explicit conservative 60,000 cap. Solid/faded walls share vertex buffers; visibility can alter submitted index ranges. Renderer FPS/memory remains a separate browser check.
