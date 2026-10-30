# Royal Capital Aurelion — concept layout

The supplied reference is the guide for the city's proportions and districts.
The playable map is now 120×80 tiles (3840×2560 world pixels), a 3:2 rectangle.
The map ID, all four linked destinations, and all 17 existing NPC IDs/services
are retained. Named arrival spawns were relocated to their corresponding gates.

## Spatial plan

- North-center: a newly generated, much larger ivory-and-cobalt Royal Palace,
  with symmetrical towers, banners and a broad front staircase.
- Northwest: residential quarter and the separate north-gate street.
- Center: royal statue, fountain square, canals and stone bridges.
- West: Adventurers' Guild and central market, four awning stalls and smithy.
- Southwest: harbor, walkable wooden quays, lighthouse, sailing ships and inn.
- Northeast: cultivated plots, farmhouse, windmill and stable service.
- East: blue Knight Guild, green Ranger Guild, violet Mage Guild, merchant hall
  and a newly generated royal cathedral.
- Southeast: trade houses and a training ground.
- Four city gates, stone walls and forest on the outside perimeter.

The city preserves the front-facing, elevated 45-degree architecture convention.
New source masters are `aurelion-palace.png` and `aurelion-city-kit.png`.
The kit contains 16 props: cathedral, windmill, three stalls, three vessels,
lighthouse, training dummy, statue, two bridges, dock, farmhouse and cave.
Source frames use reviewed transparent gutters to preserve masts and spires.

## Editing and regeneration

`src/data/aurelionConcept.ts` is the authored plan. It uses a 96×64 drafting grid
scaled by 1.25. Rectangles are converted by rounding both endpoints together,
preventing cracks and out-of-map portal rectangles. Gameplay JSON is generated
with `npm run aurelion:build`. The full world generator also applies this plan
after its generic town layout, so rebuilding the world keeps the concept city.

Actual collisions come from ground, walls, building footprints and prop
footprints. Scenery overlays do not change collision. Piers use the new walkable
`wood_plank` tile; bridge paths cross the water on reachable ground. Named
arrival points and the default fountain-square spawn are checked by the real
map compiler. The existing world loader already relocates a saved position if
it becomes blocked or unreachable after a map update.

Map district labels are optional authored area metadata. They remain world
objects and do not intercept pointer input. Boats, training props and the cave
are exterior city scenery; the existing portal destinations are unchanged.

## Validation

- Unit/data/integration suite: all maps, all portals and NPC access, building
  approaches, foundation overlaps, dock connectivity and idempotent regeneration.
- `npm run test:aurelion`: opens all 17 NPC dialogues, exports 17 capital objects,
  captures a whole-city view plus palace/market/harbor/guild/church/farm/training.
- `npm run test:maps`: pixel equality across chunk cuts and map perimeters,
  including the capital's new water/wood/stone transitions.
- `npm run test:e2e`: existing gameplay regression suite, including Aurelion jobs.
- `npm run build:standalone`: the downloadable game remains one self-contained
  HTML file. The documented standalone test mode does not bypass the managed
  browser's restriction on direct file navigation.

Outputs are in ignored `tests/e2e/screenshots/aurelion/` and the map QA folder.
The requested concept is a composition guide; this is an actual navigable tile
map assembled from individual artwork, rather than a noninteractive background.
