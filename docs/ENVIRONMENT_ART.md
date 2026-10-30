# Environment art — all 136 maps

The environment renderer uses three generated PNG source atlases in
`src/assets/environment/`: `terrain-source.png` (21 surfaces),
`props-source.png` (21 regional props) and `common-source.png` (12 shared props).
These are original generated fantasy RPG artwork, created for this project. Two additional architecture atlases cover houses, town services and castle kits; see [architecture art](ARCHITECTURE_ART.md).
Characters, icons, effects and audio retain their existing procedural pipeline.

## Theme coverage

`src/game/art/environmentManifest.ts` maps all 21 tileset IDs used by the 136
maps, including all 100 Endless Spire floors and four Sealed Crypt floors.
Related maps share a regional art direction. Existing layouts, portal locations,
NPC placement and collision rules are preserved.

Themes: Willowbrook, Sunny Meadow, Whispering Forest, Clover Hills, capital,
Fernhollow, arcane, desert, coast, snow, volcano, swamp, ruins, catacomb, cave,
tower, royal tomb, grotto, ice, magma and crypt.

## Ground and transitions

Each theme/material is generated into an opaque 256×256 texture. It contains 64
connected 32×32 tiles (eight columns, eight rows). Cosine overlap suppresses the
source-image wrap, and sampling stays aligned to world coordinates across all
chunks. These 64 tiles form a connected layout: do not shuffle/rotate them
independently in a different map editor without an equivalent edge system.

Ten ground materials are supported. Eight-neighbour masks feather grass, earth,
stone and shores with both diagonal corners and cardinal edges. Material order
is explicit; visual blending never changes walkability. Masks and sampled edge
tiles are cached with bounded edge-cache size. No sprite bounds change collision.

Neighbours are looked up using both x/y bounds, so the last column never connects
to the first column of another row. Ground/decorations are clipped to their cells;
chunk painters read a one-tile overlap and agree at cuts. Building textures keep
24 extra pixels of headroom without moving their world-space base anchor.

## Props

Source frames are explicit where generated art uses optical spacing. Props are
trimmed by alpha, fitted into the original sprite dimensions with transparent
padding, and bottom aligned. Eight deterministic size/mirroring combinations
vary the repeated objects (signs keep their reading direction). All 23 physical
object draw types use the image pipeline; the `glint` light effect remains
procedural. Buildings use the front-facing 45-degree image pipeline, preserving their established bottom anchors and town footprints.

The source atlases are not directly interchangeable uniform sprite sheets.
Use `paintEnvironmentObject` and the manifest for normalized runtime sprites.
The sarcophagus source is retained as reusable art; a narrow pillar is not
replaced by a wide sarcophagus just to use every source cell.

## Loading and failure handling

Boot waits for all atlases before opening the menu. Failure shows a visible
reload error instead of quietly treating missing artwork as a successful load.
Vite imports the image files, hashes their production names, and packages them
in `dist/assets/` with relative URLs.

## Verification

- `npm run build`: client/server type checks and production packaging.
- `npm test -- --maxWorkers=2`: gameplay/data tests plus all-map manifest checks.
- `npm run test:maps`: Chromium canvas pixel checks over every chunk-cut strip,
  every cut intersection, map corners, spawn regions and all outer perimeters;
  compares regional painting with separately painted subregions for ground,
  wall and above-player layers. Also checks material coverage and object bounds.
- The map runner captures real-game screenshots for all 21 themes and floor 100.
  Outputs: ignored `tests/e2e/screenshots/environment/` including `results.json`.
- `npm run test:e2e`: existing gameplay browser regression suite.

Playwright must be installed in the environment. Set `PLAYWRIGHT_MODULE` if it
is outside standard locations. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a system
Chromium when a bundled Playwright browser is unavailable. No download or package
manifest mutation is performed by the test runner.

Pixel equality verifies chunk composition and opaque ground; it does not prove
that every gameplay view or decorative silhouette has been manually reviewed.
Screenshots provide the visual review for representative scenes of every theme.

## Direct-open distribution

`npm run build:standalone` produces a single HTML file containing an IIFE script,
inline CSS and base64 image data. The downloadable ZIP uses this build so opening
`file://.../index.html` does not request module scripts or cross-origin stylesheets.
The regular hosted build remains available with `npm run build`.
