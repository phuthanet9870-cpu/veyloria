// Procedural map artwork. Each map is composed from its compiled layers into
// layer images (ground+decoration, walls, above-player) plus individual object
// and building sprites, coloured by the map's tileset palette.
import type { CompiledMap, PlacedBuilding } from '../../core/mapCompiler';
import { TILE } from '../../core/mapCompiler';
import type { ObjectKindDef } from '../../core/types';
import { ellipse, makeCanvas, noise, px, shade } from './canvas';
import { drawEnvironmentGround, environmentSurface } from './environmentArt';
import { layerAt, MATERIAL_PRIORITY } from './environmentManifest';

export type Palette = Record<string, string>;
const T = TILE;

function cellSeed(x: number, y: number, salt = 0) {
  return ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)) >>> 0;
}

// ------------------------------------------------------------------ ground tiles
function speckle(ctx: CanvasRenderingContext2D, ox: number, oy: number, rnd: () => number, colors: string[], n: number, size = 1) {
  for (let i = 0; i < n; i++) px(ctx, ox + Math.floor(rnd() * T), oy + Math.floor(rnd() * T), size, size, colors[Math.floor(rnd() * colors.length)]);
}

function drawGround(ctx: CanvasRenderingContext2D, id: string, ox: number, oy: number, pal: Palette, seed: number) {
  const r = noise(seed);
  const g1 = pal.grass1, g2 = pal.grass2, g3 = pal.grass3;
  switch (id) {
    case 'grass':
    case 'grass_dark': {
      const dk = id === 'grass_dark' ? -0.18 : 0;
      px(ctx, ox, oy, T, T, shade(g1, dk));
      speckle(ctx, ox, oy, r, [shade(g2, dk), shade(g3, dk)], 26, 2);
      for (let i = 0; i < 6; i++) { const x = ox + Math.floor(r() * 30), y = oy + Math.floor(r() * 28); px(ctx, x, y, 1, 3, shade(g3, dk - 0.1)); px(ctx, x + 1, y + 1, 1, 2, shade(g2, dk + 0.1)); }
      break;
    }
    case 'forest_floor': {
      px(ctx, ox, oy, T, T, pal.floor1 ?? shade(g1, -0.2));
      speckle(ctx, ox, oy, r, [pal.floor2 ?? shade(g1, -0.3), shade(g3, -0.1), pal.dirt2], 30, 2);
      break;
    }
    case 'dirt': {
      px(ctx, ox, oy, T, T, pal.dirt1);
      speckle(ctx, ox, oy, r, [pal.dirt2, shade(pal.dirt1, 0.1)], 30, 2);
      speckle(ctx, ox, oy, r, [shade(pal.dirt2, -0.2)], 4, 1);
      break;
    }
    case 'soil': {
      px(ctx, ox, oy, T, T, pal.soil1 ?? pal.dirt2);
      for (let y = 3; y < T; y += 8) px(ctx, ox, oy + y, T, 3, pal.soil2 ?? shade(pal.dirt2, -0.2));
      break;
    }
    case 'path_stone': {
      px(ctx, ox, oy, T, T, shade(pal.stone2, -0.15));
      for (let by = 0; by < 4; by++) for (let bx = 0; bx < 2; bx++) {
        const off = by % 2 ? 8 : 0;
        const x = ox + ((bx * 16 + off) % T), y = oy + by * 8;
        px(ctx, x + 1, y + 1, 14, 6, r() > 0.5 ? pal.stone1 : shade(pal.stone1, -0.06));
        px(ctx, x + 1, y + 1, 14, 1, shade(pal.stone1, 0.15));
      }
      break;
    }
    case 'ruin_floor': {
      px(ctx, ox, oy, T, T, pal.ruin2 ?? pal.stone2);
      px(ctx, ox + 1, oy + 1, 14, 14, pal.ruin1 ?? pal.stone1); px(ctx, ox + 17, oy + 1, 14, 14, shade(pal.ruin1 ?? pal.stone1, -0.05));
      px(ctx, ox + 1, oy + 17, 14, 14, shade(pal.ruin1 ?? pal.stone1, -0.08)); px(ctx, ox + 17, oy + 17, 14, 14, pal.ruin1 ?? pal.stone1);
      if (r() > 0.5) { px(ctx, ox + 5 + Math.floor(r() * 18), oy + 4, 1, 10, shade(pal.stone2, -0.3)); }
      speckle(ctx, ox, oy, r, [shade(g3, -0.2)], 5, 2);
      break;
    }
    case 'sand': {
      px(ctx, ox, oy, T, T, pal.sand1);
      speckle(ctx, ox, oy, r, [shade(pal.sand1, -0.08), shade(pal.sand1, 0.1)], 30, 1);
      break;
    }
    case 'water': {
      px(ctx, ox, oy, T, T, pal.water1);
      for (let i = 0; i < 4; i++) { const x = ox + Math.floor(r() * 24), y = oy + Math.floor(r() * 30); px(ctx, x, y, 6, 1, pal.water2); }
      break;
    }
    case 'thorn_ground': {
      px(ctx, ox, oy, T, T, pal.thorn1 ?? pal.dirt2);
      speckle(ctx, ox, oy, r, [shade(pal.thorn1 ?? pal.dirt2, -0.15), pal.thorn2 ?? g3], 24, 2);
      break;
    }
    default:
      px(ctx, ox, oy, T, T, '#ff00ff');
  }
}

function drawDeco(ctx: CanvasRenderingContext2D, id: string, ox: number, oy: number, pal: Palette, seed: number) {
  const r = noise(seed);
  switch (id) {
    case 'flowers':
      for (let i = 0; i < 4; i++) {
        const x = ox + 3 + Math.floor(r() * 24), y = oy + 3 + Math.floor(r() * 24);
        const c = [pal.flower1, pal.flower2, pal.flower3][Math.floor(r() * 3)];
        px(ctx, x, y + 2, 1, 3, shade(pal.grass3, -0.2));
        px(ctx, x - 1, y, 3, 1, c); px(ctx, x, y - 1, 1, 3, c); px(ctx, x, y, 1, 1, '#fff6c0');
      }
      break;
    case 'tuft':
      for (let i = 0; i < 3; i++) { const x = ox + 4 + Math.floor(r() * 22), y = oy + 8 + Math.floor(r() * 18); px(ctx, x, y, 1, 4, shade(pal.grass3, -0.15)); px(ctx, x + 2, y - 1, 1, 5, shade(pal.grass2, 0.1)); px(ctx, x + 4, y + 1, 1, 3, shade(pal.grass3, -0.05)); }
      break;
    case 'pebbles':
      for (let i = 0; i < 4; i++) ellipse(ctx, ox + 4 + Math.floor(r() * 24), oy + 4 + Math.floor(r() * 24), 2, 1, pal.stone1);
      break;
    case 'leaves':
      for (let i = 0; i < 5; i++) px(ctx, ox + Math.floor(r() * 30), oy + Math.floor(r() * 30), 2, 1, [pal.leaf1, pal.dirt1, '#a8742a'][Math.floor(r() * 3)]);
      break;
    case 'small_mushrooms':
      for (let i = 0; i < 2; i++) { const x = ox + 6 + Math.floor(r() * 20), y = oy + 10 + Math.floor(r() * 16); px(ctx, x, y, 2, 3, '#efe2c0'); px(ctx, x - 1, y - 2, 4, 2, i ? pal.flower1 : pal.accent); }
      break;
    case 'bramble':
      for (let i = 0; i < 3; i++) { const x = ox + Math.floor(r() * 26), y = oy + Math.floor(r() * 26); px(ctx, x, y, 6, 1, pal.thorn2 ?? '#5a7a2e'); px(ctx, x + 2, y - 1, 1, 1, '#c8e07a'); px(ctx, x + 4, y + 1, 1, 1, '#c8e07a'); }
      break;
    case 'crops':
      for (let x = 4; x < T; x += 8) for (let y = 2; y < T; y += 8) { px(ctx, ox + x, oy + y, 2, 5, '#5fae3a'); px(ctx, ox + x - 1, oy + y + 1, 1, 2, '#7fd65a'); px(ctx, ox + x + 2, oy + y + 1, 1, 2, '#7fd65a'); }
      break;
  }
}

function drawWall(ctx: CanvasRenderingContext2D, id: string, ox: number, oy: number, pal: Palette, seed: number, map: CompiledMap, cx: number, cy: number) {
  const r = noise(seed);
  switch (id) {
    case 'thicket': {
      px(ctx, ox, oy, T, T, pal.thicket2);
      for (let i = 0; i < 7; i++) ellipse(ctx, ox + 4 + Math.floor(r() * 24), oy + 4 + Math.floor(r() * 24), 6, 5, i % 2 ? pal.thicket1 : shade(pal.thicket1, 0.1));
      speckle(ctx, ox, oy, r, [shade(pal.thicket1, 0.25)], 6, 2);
      break;
    }
    case 'hedge':
      px(ctx, ox, oy + 4, T, T - 4, pal.thicket1);
      speckle(ctx, ox, oy + 4, r, [shade(pal.thicket1, 0.2), pal.thicket2], 20, 2);
      break;
    case 'fence_h': {
      const left = layerAt(map.wall, map.width, map.height, cx - 1, cy) === 'fence_h', right = layerAt(map.wall, map.width, map.height, cx + 1, cy) === 'fence_h';
      px(ctx, ox + (left ? 0 : 4), oy + 12, T - (left ? 0 : 4) - (right ? 0 : 4), 3, pal.fence);
      px(ctx, ox + (left ? 0 : 4), oy + 20, T - (left ? 0 : 4) - (right ? 0 : 4), 3, shade(pal.fence, -0.15));
      px(ctx, ox + 4, oy + 8, 4, 20, shade(pal.fence, 0.1)); px(ctx, ox + 24, oy + 8, 4, 20, shade(pal.fence, 0.1));
      px(ctx, ox + 4, oy + 8, 4, 1, shade(pal.fence, 0.35)); px(ctx, ox + 24, oy + 8, 4, 1, shade(pal.fence, 0.35));
      break;
    }
    case 'fence_v':
      px(ctx, ox + 13, oy, 6, T, shade(pal.fence, -0.1));
      px(ctx, ox + 12, oy + 2, 8, 6, shade(pal.fence, 0.1)); px(ctx, ox + 12, oy + 18, 8, 6, shade(pal.fence, 0.1));
      break;
    case 'ruin_wall':
      px(ctx, ox, oy + 2, T, T - 2, pal.ruin2 ?? pal.stone2);
      for (let y = 4; y < T; y += 8) px(ctx, ox + 1, oy + y, T - 2, 6, y % 16 ? pal.ruin1 ?? pal.stone1 : shade(pal.ruin1 ?? pal.stone1, -0.08));
      speckle(ctx, ox, oy, r, [shade(pal.grass3, -0.1)], 6, 2);
      break;
  }
}

/** Part of a map in tiles. Layers are painted per region (chunk) so big maps never need one huge image. */
export interface Region { x: number; y: number; w: number; h: number }

/** Canvas for a region, translated so tile (x, y) is drawn at its map position; plus the tile range to visit (1-tile margin for overhang). */
export function regionCanvas(map: CompiledMap, region?: Region) {
  const r = region ?? { x: 0, y: 0, w: map.width, h: map.height };
  const { canvas, ctx } = makeCanvas(r.w * T, r.h * T);
  ctx.translate(-r.x * T, -r.y * T);
  return {
    canvas, ctx,
    x0: Math.max(0, r.x - 1), y0: Math.max(0, r.y - 1), x1: Math.min(map.width, r.x + r.w + 1), y1: Math.min(map.height, r.y + r.h + 1),
  };
}

/** Ground + decoration composed into one image (Ground & Ground Decoration layers). */
export function paintGroundLayer(map: CompiledMap, pal: Palette, region?: Region): HTMLCanvasElement {
  const { canvas, ctx, x0, y0, x1, y1 } = regionCanvas(map, region);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    ctx.save(); ctx.beginPath(); ctx.rect(x * T, y * T, T, T); ctx.clip();
    if (!drawEnvironmentGround(ctx, map.def.tileset, map.ground[y * map.width + x], x * T, y * T, pal)) {
      drawGround(ctx, map.ground[y * map.width + x], x * T, y * T, pal, cellSeed(x, y));
    }
    ctx.restore();
  }
  // Eight-neighbour feathering includes concave and convex corners; all lookups
  // use map bounds rather than the current chunk, so cuts remain pixel-identical.
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const id = map.ground[y * map.width + x];
    const neighbours = new Map<string, number>();
    DIRECTIONS.forEach(([dx, dy], bit) => {
      const other = layerAt(map.ground, map.width, map.height, x + dx, y + dy);
      if (other && MATERIAL_PRIORITY[other] < MATERIAL_PRIORITY[id]) neighbours.set(other, (neighbours.get(other) ?? 0) | (1 << bit));
    });
    for (const [other, mask] of neighbours) {
      const surface = environmentSurface(map.def.tileset, other, pal);
      if (surface) ctx.drawImage(transitionTile(surface, mask, x % 8, y % 8), x * T, y * T);
    }
    const d = map.deco[y * map.width + x];
    if (d) {
      ctx.save(); ctx.beginPath(); ctx.rect(x * T, y * T, T, T); ctx.clip();
      drawDeco(ctx, d, x * T, y * T, pal, cellSeed(x, y, 3)); ctx.restore();
    }
  }
  return canvas;
}

const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]];
const transitionMasks = new Map<number, HTMLCanvasElement>();
const transitionTiles = new WeakMap<HTMLCanvasElement, Map<number, HTMLCanvasElement>>();
function transitionTile(surface: HTMLCanvasElement, mask: number, tx: number, ty: number): HTMLCanvasElement {
  let cache = transitionTiles.get(surface);
  if (!cache) { cache = new Map(); transitionTiles.set(surface, cache); }
  const key = mask * 64 + ty * 8 + tx;
  const found = cache.get(key); if (found) return found;
  let alpha = transitionMasks.get(mask);
  if (!alpha) {
    const a = makeCanvas(T, T), image = a.ctx.createImageData(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let opacity = 0;
      DIRECTIONS.forEach(([dx, dy], bit) => {
        if (!(mask & (1 << bit))) return;
        const xx = dx < 0 ? x : T - 1 - x, yy = dy < 0 ? y : T - 1 - y;
        const distance = dx === 0 ? yy : dy === 0 ? xx : Math.hypot(xx, yy);
        const along = dx === 0 ? x : y;
        const width = 4.5 + Math.sin(along * Math.PI / 8) * 1.3;
        opacity = Math.max(opacity, Math.max(0, 1 - distance / width));
      });
      const i = (y * T + x) * 4; image.data[i] = image.data[i + 1] = image.data[i + 2] = 255; image.data[i + 3] = Math.round(opacity * 255);
    }
    a.ctx.putImageData(image, 0, 0); alpha = a.canvas; transitionMasks.set(mask, alpha);
  }
  const { canvas, ctx } = makeCanvas(T, T);
  ctx.drawImage(surface, tx * T, ty * T, T, T, 0, 0, T, T);
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(alpha, 0, 0);
  // Bound retained edge tiles while traversing many different biomes.
  if (cache.size >= 512) cache.clear();
  cache.set(key, canvas); return canvas;
}

/** Walls layer (fences, hedges, border thicket, ruins). */
export function paintWallLayer(map: CompiledMap, pal: Palette, region?: Region): HTMLCanvasElement {
  const { canvas, ctx, x0, y0, x1, y1 } = regionCanvas(map, region);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const w = map.wall[y * map.width + x];
    if (w) drawWall(ctx, w, x * T, y * T, pal, cellSeed(x, y, 5), map, x, y);
  }
  return canvas;
}

/** Above-player layer: canopy overhang drawn over characters. */
export function paintAboveLayer(map: CompiledMap, pal: Palette, region?: Region): HTMLCanvasElement {
  const { canvas, ctx, x0, y0, x1, y1 } = regionCanvas(map, region);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (map.above[y * map.width + x] !== 'canopy_overhang') continue;
    const r = noise(cellSeed(x, y, 9));
    for (let i = 0; i < 4; i++) ellipse(ctx, x * T + 4 + Math.floor(r() * 24), y * T + 20 + Math.floor(r() * 14), 7, 6, i % 2 ? pal.thicket1 : pal.thicket2);
    for (let i = 0; i < 3; i++) px(ctx, x * T + Math.floor(r() * 30), y * T + 30 + Math.floor(r() * 10), 2, 2, shade(pal.thicket1, 0.2));
  }
  return canvas;
}

// ------------------------------------------------------------------ objects
export function paintObject(kind: ObjectKindDef, pal: Palette, seed: number): HTMLCanvasElement {
  const w = kind.spriteW, h = kind.spriteH;
  const { canvas, ctx } = makeCanvas(w, h);
  const r = noise(seed);
  const cx = w / 2, base = h - 3;
  const shadow = (rx: number, ry = 4) => ellipse(ctx, cx, base - 1, rx, ry, 'rgba(0,0,0,0.25)');
  switch (kind.draw) {
    case 'tree_oak': case 'tree_dark': {
      const dark = kind.draw === 'tree_dark';
      shadow(18, 5);
      px(ctx, cx - 5, base - 30, 10, 30, pal.trunk); px(ctx, cx - 5, base - 30, 3, 30, shade(pal.trunk, 0.15));
      px(ctx, cx - 9, base - 4, 4, 4, pal.trunk); px(ctx, cx + 5, base - 4, 4, 4, pal.trunk);
      const l1 = dark ? pal.thicket1 : pal.leaf1, l2 = dark ? pal.thicket2 : shade(pal.leaf1, -0.15), l3 = dark ? shade(pal.thicket1, 0.15) : pal.leaf2;
      const top = base - 30;
      for (let i = 0; i < 9; i++) ellipse(ctx, cx - 18 + Math.floor(r() * 36), top - 22 + Math.floor(r() * 26), 12, 10, l2);
      for (let i = 0; i < 7; i++) ellipse(ctx, cx - 16 + Math.floor(r() * 30), top - 28 + Math.floor(r() * 22), 10, 9, l1);
      for (let i = 0; i < 5; i++) ellipse(ctx, cx - 14 + Math.floor(r() * 24), top - 34 + Math.floor(r() * 16), 6, 5, l3);
      if (dark) for (let i = 0; i < 4; i++) px(ctx, cx - 18 + Math.floor(r() * 36), top - 30 + Math.floor(r() * 30), 2, 2, pal.accent);
      break;
    }
    case 'tree_pine': {
      shadow(14, 4);
      px(ctx, cx - 3, base - 18, 6, 18, pal.trunk);
      for (let i = 0; i < 4; i++) {
        const y = base - 22 - i * 18, half = 22 - i * 4;
        ctx.fillStyle = i % 2 ? pal.thicket1 : shade(pal.thicket1, 0.1);
        ctx.beginPath(); ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y); ctx.lineTo(cx, y - 26); ctx.closePath(); ctx.fill();
        px(ctx, cx - half + 4, y - 2, half, 2, shade(pal.thicket1, 0.25));
      }
      break;
    }
    case 'bush':
      shadow(14, 3);
      ellipse(ctx, cx - 6, base - 10, 9, 8, pal.leaf1); ellipse(ctx, cx + 6, base - 10, 9, 8, pal.leaf1); ellipse(ctx, cx, base - 15, 9, 8, pal.leaf2);
      px(ctx, cx - 3, base - 18, 2, 2, pal.flower1);
      break;
    case 'rock':
      shadow(13, 3);
      ellipse(ctx, cx, base - 9, 13, 9, pal.stone2); ellipse(ctx, cx - 3, base - 12, 8, 5, pal.stone1); px(ctx, cx - 6, base - 15, 4, 1, shade(pal.stone1, 0.3));
      break;
    case 'rock_big':
      shadow(28, 5);
      ellipse(ctx, cx, base - 18, 28, 18, pal.stone2); ellipse(ctx, cx - 6, base - 24, 18, 11, pal.stone1); px(ctx, cx - 14, base - 30, 10, 2, shade(pal.stone1, 0.3));
      break;
    case 'stump':
      shadow(12, 3);
      px(ctx, cx - 10, base - 14, 20, 14, pal.trunk); ellipse(ctx, cx, base - 14, 10, 4, shade(pal.trunk, 0.3)); ellipse(ctx, cx, base - 14, 5, 2, shade(pal.trunk, 0.1));
      break;
    case 'crate':
      shadow(13, 3);
      px(ctx, cx - 13, base - 26, 26, 26, '#9a6a3a'); px(ctx, cx - 13, base - 26, 26, 3, '#b8854a');
      px(ctx, cx - 13, base - 14, 26, 2, '#6a4a2a'); px(ctx, cx - 1, base - 26, 2, 26, '#6a4a2a');
      break;
    case 'barrel':
      shadow(11, 3);
      px(ctx, cx - 10, base - 28, 20, 28, '#8b5a2b'); ellipse(ctx, cx, base - 28, 10, 3, '#a8744a');
      px(ctx, cx - 10, base - 22, 20, 2, '#4a4a52'); px(ctx, cx - 10, base - 8, 20, 2, '#4a4a52'); px(ctx, cx - 6, base - 26, 2, 24, '#a8744a');
      break;
    case 'well':
      shadow(28, 5);
      px(ctx, cx - 26, base - 28, 52, 28, pal.stone2);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) px(ctx, cx - 25 + x * 9 + (y % 2) * 4, base - 27 + y * 9, 8, 8, x % 2 ? pal.stone1 : shade(pal.stone1, -0.08));
      ellipse(ctx, cx, base - 30, 22, 6, '#1a2a3a'); ellipse(ctx, cx, base - 30, 18, 4, pal.water1);
      px(ctx, cx - 24, base - 66, 4, 38, pal.trunk); px(ctx, cx + 20, base - 66, 4, 38, pal.trunk);
      ctx.fillStyle = '#8a3a2a'; ctx.beginPath(); ctx.moveTo(cx - 30, base - 62); ctx.lineTo(cx + 30, base - 62); ctx.lineTo(cx, base - 78); ctx.closePath(); ctx.fill();
      px(ctx, cx - 1, base - 62, 2, 20, '#c8b89a'); px(ctx, cx - 4, base - 44, 8, 6, '#7a5634');
      break;
    case 'fountain':
      shadow(44, 6);
      ellipse(ctx, cx, base - 18, 44, 18, pal.stone2); ellipse(ctx, cx, base - 20, 40, 14, pal.stone1); ellipse(ctx, cx, base - 21, 34, 10, pal.water1);
      ellipse(ctx, cx - 8, base - 23, 10, 3, pal.water2);
      px(ctx, cx - 5, base - 56, 10, 36, pal.stone1); ellipse(ctx, cx, base - 56, 14, 5, pal.stone2); ellipse(ctx, cx, base - 57, 11, 3, pal.water2);
      px(ctx, cx - 1, base - 72, 2, 14, pal.water2); ellipse(ctx, cx, base - 74, 3, 3, '#ffffff');
      // star statue accent
      px(ctx, cx - 1, base - 80, 2, 6, '#f2d23a');
      break;
    case 'signpost':
      shadow(8, 2);
      px(ctx, cx - 2, base - 30, 4, 30, pal.trunk); px(ctx, cx - 13, base - 38, 26, 12, '#b8854a'); px(ctx, cx - 13, base - 38, 26, 2, '#d8a86a');
      px(ctx, cx - 9, base - 33, 18, 1, '#5a3a1e'); px(ctx, cx - 9, base - 30, 12, 1, '#5a3a1e');
      break;
    case 'anvil':
      shadow(12, 3);
      px(ctx, cx - 4, base - 12, 8, 12, '#3a3a42'); px(ctx, cx - 12, base - 18, 24, 7, '#55555f'); px(ctx, cx - 14, base - 18, 6, 4, '#55555f'); px(ctx, cx - 10, base - 18, 18, 1, '#8a8a96');
      break;
    case 'tent': case 'goblin_tent': {
      const goblin = kind.draw === 'goblin_tent';
      const c1 = goblin ? '#6a5a3a' : '#c8b89a', c2 = goblin ? '#4a3a22' : '#9a8a6a';
      shadow(44, 5);
      ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(cx - 46, base); ctx.lineTo(cx + 46, base); ctx.lineTo(cx, base - 70); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(cx - 12, base); ctx.lineTo(cx + 12, base); ctx.lineTo(cx, base - 40); ctx.closePath(); ctx.fill();
      px(ctx, cx - 1, base - 76, 2, 10, '#5a3a1e');
      if (goblin) { px(ctx, cx - 30, base - 30, 6, 2, '#e8e0c8'); px(ctx, cx + 22, base - 24, 6, 2, '#e8e0c8'); px(ctx, cx, base - 82, 8, 5, '#c83a3a'); }
      else px(ctx, cx, base - 80, 9, 5, '#3f7a45');
      break;
    }
    case 'lamp_post':
      shadow(7, 2);
      px(ctx, cx - 2, base - 56, 4, 56, '#3a3a42'); px(ctx, cx - 5, base - 4, 10, 4, '#3a3a42');
      px(ctx, cx - 7, base - 68, 14, 12, '#2a2a32'); px(ctx, cx - 5, base - 66, 10, 8, '#ffd98a'); px(ctx, cx - 8, base - 70, 16, 3, '#2a2a32');
      break;
    case 'campfire':
      shadow(12, 3);
      for (let i = 0; i < 6; i++) ellipse(ctx, cx + Math.cos(i) * 10, base - 5 + Math.sin(i) * 3, 3, 2, pal.stone2);
      px(ctx, cx - 9, base - 7, 18, 3, pal.trunk); px(ctx, cx - 3, base - 10, 6, 3, shade(pal.trunk, -0.2));
      ellipse(ctx, cx, base - 14, 6, 8, '#ff7a2e'); ellipse(ctx, cx, base - 12, 4, 5, '#ffd34d'); px(ctx, cx - 1, base - 24, 2, 4, '#ff7a2e');
      break;
    case 'haystack':
      shadow(16, 4);
      ellipse(ctx, cx, base - 14, 16, 14, '#d8b85a'); ellipse(ctx, cx - 3, base - 18, 10, 8, '#ecd27a');
      for (let i = 0; i < 6; i++) px(ctx, cx - 12 + Math.floor(r() * 24), base - 26 + Math.floor(r() * 20), 1, 4, '#b8984a');
      break;
    case 'ruin_pillar':
      shadow(12, 3);
      px(ctx, cx - 10, base - 64, 20, 64, pal.ruin2 ?? pal.stone2); px(ctx, cx - 8, base - 64, 6, 64, pal.ruin1 ?? pal.stone1);
      px(ctx, cx - 13, base - 70, 26, 8, pal.ruin1 ?? pal.stone1); px(ctx, cx - 13, base - 6, 26, 6, pal.ruin1 ?? pal.stone1);
      px(ctx, cx + 2, base - 50, 1, 14, shade(pal.stone2, -0.35)); px(ctx, cx - 10, base - 40, 4, 8, shade(pal.grass3, -0.1));
      break;
    case 'gravestone':
      shadow(11, 3);
      px(ctx, cx - 10, base - 24, 20, 24, pal.ruin2 ?? pal.stone2); ellipse(ctx, cx, base - 24, 10, 6, pal.ruin2 ?? pal.stone2);
      px(ctx, cx - 1, base - 26, 2, 12, shade(pal.stone2, -0.35)); px(ctx, cx - 5, base - 22, 10, 2, shade(pal.stone2, -0.35));
      break;
    case 'obelisk':
      shadow(14, 4);
      ctx.fillStyle = '#4a4a6a'; ctx.beginPath(); ctx.moveTo(cx - 12, base); ctx.lineTo(cx + 12, base); ctx.lineTo(cx + 7, base - 80); ctx.lineTo(cx, base - 92); ctx.lineTo(cx - 7, base - 80); ctx.closePath(); ctx.fill();
      px(ctx, cx - 5, base - 80, 3, 78, '#6a6a8a');
      for (let i = 0; i < 6; i++) px(ctx, cx - 2 + (i % 2) * 2, base - 74 + i * 11, 3, 5, '#9ad8ff');
      ellipse(ctx, cx, base - 88, 3, 3, '#e0f4ff');
      break;
    case 'thorn_throne':
      shadow(44, 6);
      px(ctx, cx - 40, base - 30, 80, 30, '#4a3220'); px(ctx, cx - 30, base - 70, 60, 42, '#3a2618');
      for (let i = -40; i <= 36; i += 8) { px(ctx, cx + i, base - 40 - (i % 16 === 0 ? 46 : 30), 4, 40, '#5a7a2e'); px(ctx, cx + i + 1, base - 42 - (i % 16 === 0 ? 46 : 30), 2, 3, '#c8e07a'); }
      px(ctx, cx - 26, base - 34, 52, 6, '#6a4a2a');
      break;
    case 'planter':
      shadow(13, 3);
      px(ctx, cx - 13, base - 14, 26, 14, '#8a5a3a'); px(ctx, cx - 13, base - 14, 26, 2, '#a8744a');
      for (let i = 0; i < 5; i++) { const x = cx - 10 + i * 5; px(ctx, x, base - 20, 1, 6, pal.leaf1); px(ctx, x - 1, base - 22, 3, 2, [pal.flower1, pal.flower2, pal.flower3][i % 3]); }
      break;
    case 'glint':
      ellipse(ctx, cx, cy(h), 3, 3, '#ffffff'); px(ctx, cx - 8, cy(h), 16, 1, '#ffffffaa'); px(ctx, cx, cy(h) - 8, 1, 16, '#ffffffaa');
      break;
    default:
      px(ctx, 0, 0, w, h, '#ff00ff');
  }
  return canvas;
}

function cy(h: number) { return Math.floor(h / 2); }

// ------------------------------------------------------------------ buildings
const ROOF: Record<string, { roof: string; wall: string; trim: string }> = {
  inn: { roof: '#b8483a', wall: '#e8d8b8', trim: '#7a4a2a' },
  smithy: { roof: '#4a4f5f', wall: '#b9b2a4', trim: '#3a2a1a' },
  shop: { roof: '#3a7ab8', wall: '#efe2c8', trim: '#6a4a2a' },
  guild: { roof: '#6a3a8a', wall: '#e2d8c8', trim: '#4a2a1a' },
  house: { roof: '#9a6a3a', wall: '#e8dcc0', trim: '#6a4a2a' },
};

export function paintBuilding(b: PlacedBuilding, pal?: Palette): HTMLCanvasElement {
  const original = ROOF[b.style] ?? ROOF.house;
  const style = pal ? { roof: pal.leaf1, wall: pal.stone1, trim: pal.trunk } : original;
  const w = b.w * T, wallH = 2 * T, roofExtra = 18;
  const h = b.h * T + roofExtra;
  // Headroom keeps chimneys, flags and guild signs inside the source texture.
  const { canvas, ctx } = makeCanvas(w + 8, h + 28);
  ctx.translate(0, 24);
  const ox = 4, base = h;
  ellipse(ctx, ox + w / 2, base, w / 2 + 2, 6, 'rgba(0,0,0,0.25)');
  // Walls
  const wy = base - wallH;
  px(ctx, ox, wy, w, wallH, style.wall);
  for (let x = 0; x < w; x += 16) px(ctx, ox + x, wy, 1, wallH, shade(style.wall, -0.12));
  px(ctx, ox, wy, w, 3, style.trim); px(ctx, ox, base - 3, w, 3, shade(style.trim, -0.2));
  // Windows
  for (let i = 0; i < b.w; i++) {
    if (b.door != null && Math.abs(i - b.door) < 1) continue;
    if (i % 2 === 1) {
      px(ctx, ox + i * T + 7, wy + 14, 18, 16, style.trim);
      px(ctx, ox + i * T + 9, wy + 16, 14, 12, '#ffe9a8');
      px(ctx, ox + i * T + 15, wy + 16, 2, 12, style.trim); px(ctx, ox + i * T + 9, wy + 21, 14, 2, style.trim);
    }
  }
  // Door
  if (b.door != null) {
    const dx = ox + b.door * T + 4;
    px(ctx, dx, base - 40, 24, 40, style.trim); px(ctx, dx + 2, base - 38, 20, 38, '#6a4022');
    px(ctx, dx + 2, base - 38, 20, 2, '#8a5a32'); px(ctx, dx + 17, base - 20, 2, 2, '#f2d23a');
  }
  // Roof
  const roofH = h - wallH - 2;
  const ry = wy - roofH + 6;
  ctx.fillStyle = style.roof;
  ctx.beginPath(); ctx.moveTo(ox - 4, wy + 6); ctx.lineTo(ox + w + 4, wy + 6); ctx.lineTo(ox + w - 10, ry); ctx.lineTo(ox + 10, ry); ctx.closePath(); ctx.fill();
  for (let y = ry + 6; y < wy + 6; y += 7) {
    const t = (y - ry) / (wy + 6 - ry);
    const inset = 10 - 14 * t;
    px(ctx, ox + inset, y, w - inset * 2, 2, shade(style.roof, -0.18));
    for (let x = ox + inset + ((y / 7) % 2) * 6; x < ox + w - inset; x += 12) px(ctx, x, y - 4, 1, 4, shade(style.roof, -0.1));
  }
  px(ctx, ox + 10, ry, w - 20, 3, shade(style.roof, 0.2));
  if (b.style === 'smithy') { px(ctx, ox + w - 40, ry - 20, 14, 30, '#5a5a62'); px(ctx, ox + w - 42, ry - 22, 18, 4, '#3a3a42'); }
  if (b.style === 'guild') {
    px(ctx, ox + w / 2 - 12, ry - 6, 24, 30, '#c83a3a'); px(ctx, ox + w / 2 - 12, ry - 6, 24, 3, '#f2d23a');
    ellipse(ctx, ox + w / 2, ry + 10, 6, 6, '#f2d23a');
  }
  if (b.style === 'shop') {
    for (let x = 0; x < w; x += 16) px(ctx, ox + x, wy - 2, 16, 8, x % 32 ? '#ffffff' : '#3a7ab8');
  }
  if (b.style === 'inn') { px(ctx, ox + 8, ry - 14, 10, 20, '#7a4a2a'); }
  // Sign board
  if (b.sign) {
    ctx.font = 'bold 9px monospace';
    const tw = Math.min(w - 8, ctx.measureText(b.sign).width + 10);
    const sx = ox + (w - tw) / 2, sy = wy + 2;
    px(ctx, sx, sy, tw, 12, '#5a3a1e'); px(ctx, sx + 1, sy + 1, tw - 2, 10, '#c8a26b');
    ctx.fillStyle = '#3a2412';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.sign, sx + 5, sy + 6.5, tw - 10);
  }
  return canvas;
}
