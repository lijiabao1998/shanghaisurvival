# Representative Menghua-inspired facade and interior candidate

Base: production 839dc858. This branch is not a deployment.

Reference: The Paper historical Menghua Street photographic feature, https://h5.thepaper.cn/html/interactive/2023/01/menghuajie/ . Viewed p301 (button shop), p102 (grocery) and p103 (upper facades). These support weathered gray cement shoulders, dark plinths, red-brown painted sign boards, pale rolling-door frames and close-to-wall utility cables. Not a current 2026 survey; no measured facade dimensions or calibrated color claims. Original procedural geometry only; no photos copied into game assets and no real shop identity/address reproduced.

Nine representative room buildings receive clearer shop-front materials, utility box/cables and sloped awnings. Nine fictional readable signs use one shared 1024-square local canvas atlas; shared material, 36 vertices/18 triangles, up to nine additional draw calls. Signs hide with their owning faded facade. Text uses available system CJK fonts, not downloaded fonts; actual glyph rendering still requires browser verification.

Existing nine rooms retain original layouts, collision, loot IDs and source coordinates. Indoor surface/furniture details include cloth seams, enamel cup/bowl openings, wood wear, paper labels, oil stains and divided parts trays. The four infill buildings remain enterable shells, not newly furnished interiors.

Verification boundary: local production build and regression scripts passed before subsequent extra-pickup integration. Local Chromium cannot start: process_singleton socket() EPERM. No new actual game screenshot or graphical acceptance can be claimed; no Shanghai CI is used. Do not substitute an illustration or old screenshot for this candidate.

## Interactive indoor finds
Each of the nine existing furnished rooms gets one append-only extra cache on the validated clear central corridor: home first-aid pack, grocery food, repair-room 9mm supply pack. It uses the existing held E / touch interaction, range and line-of-sight gate, inventory capacity check and immediate persistence. An ammo pack uses the existing backpack action to yield six 9mm rounds; no rifle compatibility is implied. Stable `room-extra-v1:<building>:(ammo|medkit|food)` flags share the bounded interiorLoot save table. Original nine supply IDs/depletion and ordinary 48-container indexing remain unchanged. Old saves keep their three-room layout and receive only those rooms' extras; six expansion-room extras stay disabled for legacy layout.

Table/workbench clutter remains decorative, but a subsequent functional iteration adds two separately modelled, explicit pickable tools in the original home/repair rooms. Those objects, unlike the background clutter, grant persistent ownership and can be equipped in either hand. See the functional tool section below.

Final local verification: fresh Vite production build and all 44 `tools/test-*.mjs` scripts pass after pickup integration. Actual extracted updateLoot function tested for held interaction, one grant, immediate persistence, repeat rejection and full capacity retention; JSON save round-trip retains extra ammo flag and rejects unknown suffix atomically. Pure placement tests confirm all nine new pickup points clear original walls/furniture at actor radius .36 and at least 1m from original supply. These are local automated checks, not desktop/mobile rendered gameplay acceptance.


## Functional kitchen cleaver and wrench
Two append-only `room-tool-v1` pickup sites, placed on validated clear indoor corridor points, grant cleaver/wrench ownership without changing original supplies or handing out weapons on migration. Owned tools are a strictly validated optional `survivorSystems.ownedTools` extension; absent old data remains unchanged. Depleted tool flags require matching ownership when saving, preventing a partial save that loses the collected tool. Duplicate/invalid tool grants are rejected. Both hands can equip different owned tools; rifle two-hand restrictions remain. Backpack selection updates actual hand models. Tools add fictional balancing carry weight.

Actual combat uses existing swept blade/blunt animation windows with separate arcade reach/damage/knockback, stamina cost, LOS, and one hit per target per strike; no ammo consumption. Original pipe behavior remains. Local actual-function tests cover tool pickup, equipment UI, strikes, wall blocking, duplicate rejection and persistence. Browser rendering, touch input, held-model visual placement and real device performance remain unverified because local Chromium cannot start; no Shanghai CI run or deployment is implied.

Functional tool integration final local verification: fresh production build + all 47 test scripts passed; the subsequently added actual-backpack cleaver-selection assertion also passed. No visual/touch acceptance inferred. Previous 44-test note refers to the pre-tool checkpoint only.
