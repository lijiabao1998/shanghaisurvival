# Nine-room candidate — append-only identity expansion

Not deployed or visually accepted by this document. Nine real CMAB footprints reuse three original room categories; interiors are fictional plausible layouts, not a measured reproduction of these homes.

Fixed catalog in `interior-rooms.ts`:

| building ID | kind | generation |
|---|---|---|
| cmab_327821_0 | home | original |
| cmab_327816_0 | grocer | original |
| cmab_327817_0 | repair | original |
| cmab_327814_0 | home | added |
| cmab_325911_0 | grocer | added |
| cmab_327818_0 | repair | added |
| cmab_327826_0 | home | added |
| cmab_327825_0 | grocer | added |
| cmab_327823_0 | repair | added |

Original three exact entrance, furniture, focus points, loot IDs/items/counts/positions are frozen in a regression fixture. Room assignment no longer depends on distance or input ordering. Missing or unsafe footprints are omitted, not silently replaced. Added generations vary textile/tin/tool-tray palettes without moving colliders. Default/max count nine; caller may explicitly retain three or six.

Per-room central corridor remains 1.2 m construction clearance, with sampled doorway route checked using actual player radius .36 and the real wall grid. Decorations stay within authoritative furniture envelopes. These are gameplay clearance values, not photograph-derived dimensions.

Budget: two batched meshes/room, at most 18 room meshes; <=6,000 furniture vertices/room and <60,000 combined vertices including floors. Actual fixture map: 12,405 total vertices across nine rooms. No texture/canvas/network resources added. Mobile rendered performance and actual touch traversal still require browser acceptance; geometry counts alone are not that acceptance.

Persistence: stable `room-v1:<building-id>:supply` keys, nine total below parser limit 64. Original three true/depleted flags must remain true; new keys start false only when absent, and later true persists. Ordinary 48 save containers keep their original order/count; no parser changes.

Existing-save collision consideration: an old player may have walked into a formerly unfurnished new room. Integration therefore requires an explicit world-layout opt-in: saves without a new-layout marker must retain only the original three rooms, while newly created campaigns may use nine. Do not silently teleport old players to make new furniture fit. Layout marker parsing/runtime gating belongs to the integrating agent, not this pure planning module. Random ordinary containers use outside-building placement; unusual imported/manual indoor coordinates also must not be overwritten to accommodate expansion.

Tests cover original exact layout preservation, all nine real corridors, finite bounded batched art, source-map immutability, reverse input ordering, omitted footprint stability, maximum limits, old/new depletion roundtrip and ordinary-container preservation. Browser screenshots/9-room traversal are separate required evidence before claiming completion.
