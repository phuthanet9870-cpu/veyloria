# Front-facing architecture: 45-degree elevation

Every new architecture sprite uses a single authored orthographic camera:
front facade facing south (toward the bottom of the screen), camera elevated
45 degrees, roof visible above the facade. Runtime rotation and mirroring are
never applied. This is not a diagonally rotated isometric map grid.

## Artwork

- `architecture-buildings.png`: 35 buildings, seven regional themes × five
  styles: house, inn, shop, smithy and guild hall.
- `architecture-castles.png`: 21 kit parts, seven regional themes × castle
  keep, city gate and wall section.
- Themes: Willowbrook, capital, Fernhollow, arcane, desert, coast and snow.
- Source frames are defined in `architectureManifest.ts` using reviewed alpha
  gutters so chimneys, snow caps, banners and tower tips are not cut.
- `architectureFrame` trims within the source rectangle; output renderers add
  transparent padding. Houses/services keep their established bottom anchors.
  Asymmetric workshop/inn front openings map to reserved doorway positions.

All 132 existing town buildings now use this image pipeline. Castle Veyl adds
one keep and renders its existing courtyard walls and gate using the castle kit.
The four-cell central corridor stays open. The Emperium stays at its original
protocol position; no server-coordinate migration is required. The other castle
kit themes are available as reusable sprites without adding new collision to
unrelated maps.

The existing world dimensions, town layout and service/NPC positions are retained.
Large roofs can naturally leave the viewport while walking; sprite padding checks
verify the source texture itself is complete, not that every building is visible
in every camera position.

## Checks

- `npm test -- --maxWorkers=2`: building coverage, siege-route reachability and
  all existing rules/data/server tests.
- `npm run test:architecture`: 140 padded render checks, 56 sprite exports,
  seven town views plus Castle Veyl, and live-image rotation/flip checks.
- Output: ignored `tests/e2e/screenshots/architecture/`.
- `npm run build:standalone`: embed these new PNG atlases along with the existing
  artwork in the single-file download, retaining the fix for file-open CORS.
- Standalone runtime checks use the documented HTTP mode when managed-browser
  policy prohibits direct file navigation. This is not a claim of a successful
  direct `file://` test on that machine.
