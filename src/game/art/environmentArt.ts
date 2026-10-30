import terrainUrl from '../../assets/environment/terrain-source.png';
import propsUrl from '../../assets/environment/props-source.png';
import commonUrl from '../../assets/environment/common-source.png';
import type { ObjectKindDef } from '../../core/types';
import { ENVIRONMENT_THEMES, terrainSource } from './environmentManifest';
import { hexToRgb, makeCanvas } from './canvas';

export const ENVIRONMENT_SURFACE_SIZE = 256;

let terrain: HTMLImageElement | null = null;
let props: HTMLImageElement | null = null;
let common: HTMLImageElement | null = null;
const surfaces = new Map<string, HTMLCanvasElement>();
const sprites = new Map<number, HTMLCanvasElement>();
let loading: Promise<void> | undefined;

/** Finish loading before the first scene; missing artwork is a visible startup error. */
export function loadEnvironmentArt(): Promise<void> {
  return loading ??= Promise.all([terrainUrl, propsUrl, commonUrl].map(url => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Environment artwork could not load: ${url}`)); img.src = url;
  }))).then(([a, b, c]) => { terrain = a; props = b; common = c; });
}

function cell(image: HTMLImageElement, index: number, inset = 0) {
  const col = index % 7, row = Math.floor(index / 7);
  const x = Math.round(col * image.width / 7) + inset, y = Math.round(row * image.height / 3) + inset;
  return { x, y, w: Math.round((col + 1) * image.width / 7) - x - inset, h: Math.round((row + 1) * image.height / 3) - y - inset };
}

// Explicit source frames: generated source art has optical spacing rather than
// exact machine-sized cells. Never assume its trees fit a uniform 1/7 rectangle.
const PROP_COLUMNS = [0, 310, 565, 825, 1105, 1385, 1660, 1916];
const PROP_ROWS = [0, 306, 570, 821];
function propCell(image: HTMLImageElement, index: number) {
  const col = index % 7, row = Math.floor(index / 7);
  const x = Math.round(PROP_COLUMNS[col] * image.width / 1916), y = Math.round(PROP_ROWS[row] * image.height / 821);
  return { x, y, w: Math.round(PROP_COLUMNS[col + 1] * image.width / 1916) - x, h: Math.round(PROP_ROWS[row + 1] * image.height / 821) - y };
}

/** Sixty-four connected 32px variants in a 256×256 toroidal texture, with no tile borders.
 * Cosine overlap makes each source wrap invisible. Samples are always world-aligned,
 * so neighbours, diagonal corners and independently painted chunks agree exactly. */
export function environmentSurface(theme: string, material: string, palette: Record<string, string>): HTMLCanvasElement | null {
  if (!terrain) return null;
  const key = `${theme}:${material}`;
  const cached = surfaces.get(key); if (cached) return cached;
  const { canvas, ctx } = makeCanvas(256, 256);
  const c = cell(terrain, terrainSource(theme, material), 3);
  ctx.drawImage(terrain, c.x, c.y, c.w, c.h, 0, 0, 256, 256);
  const src = ctx.getImageData(0, 0, 256, 256), dst = ctx.createImageData(256, 256);
  const color = material === 'water' ? palette.water1 : material === 'sand' ? palette.sand1 : material === 'dirt' ? palette.dirt1 : material === 'soil' ? palette.soil1 ?? palette.dirt2 : material === 'path_stone' || material === 'ruin_floor' ? palette.stone1 : palette.grass1;
  const rgb = hexToRgb(color), tint = theme === 'arcane' || theme === 'swamp' ? 0.24 : 0.10;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const wx = (1 - Math.cos(2 * Math.PI * x / 256)) / 2, wy = (1 - Math.cos(2 * Math.PI * y / 256)) / 2;
    const indices = [(y * 256 + x) * 4, (y * 256 + (x + 128) % 256) * 4, (((y + 128) % 256) * 256 + x) * 4, (((y + 128) % 256) * 256 + (x + 128) % 256) * 4];
    const weights = [wx * wy, (1 - wx) * wy, wx * (1 - wy), (1 - wx) * (1 - wy)];
    const i = (y * 256 + x) * 4;
    for (let k = 0; k < 3; k++) {
      let v = 0; for (let j = 0; j < 4; j++) v += src.data[indices[j] + k] * weights[j];
      const dark = material === 'grass_dark' ? 0.79 : material === 'soil' ? 0.75 : material === 'forest_floor' ? 0.9 : 1;
      dst.data[i + k] = (v * (1 - tint) + rgb[k] * tint) * dark;
    }
    dst.data[i + 3] = 255;
  }
  ctx.putImageData(dst, 0, 0); surfaces.set(key, canvas); return canvas;
}

export function drawEnvironmentGround(ctx: CanvasRenderingContext2D, theme: string, material: string, x: number, y: number, palette: Record<string, string>): boolean {
  const tex = environmentSurface(theme, material, palette); if (!tex) return false;
  const sx = ((x % 256) + 256) % 256, sy = ((y % 256) + 256) % 256;
  ctx.drawImage(tex, sx, sy, 32, 32, x, y, 32, 32); return true;
}

function propIndex(theme: string, draw: string): number | null {
  const themed = ENVIRONMENT_THEMES[theme]?.prop ?? 0;
  if (draw.startsWith('tree_')) return theme === 'snow' ? 7 : theme === 'desert' || theme === 'coast' ? 5 : theme === 'swamp' ? 9 : theme === 'volcano' ? 8 : theme === 'arcane' ? 4 : theme.startsWith('dg_') ? themed : draw === 'tree_dark' ? 2 : 0;
  if (draw === 'rock' || draw === 'rock_big') return theme === 'snow' || theme === 'dg_ice' ? 16 : theme === 'volcano' || theme === 'dg_magma' ? 17 : theme === 'arcane' ? 4 : theme === 'dg_grotto' ? 15 : draw === 'rock_big' ? 22 : 21;
  if (draw === 'bush') return theme === 'desert' ? 5 : theme === 'snow' ? 7 : theme === 'swamp' ? 9 : 1;
  return ({ fountain: 3, barrel: 6, ruin_pillar: theme === 'dg_tower' ? 13 : theme === 'dg_ice' ? 16 : theme === 'dg_grotto' ? 15 : theme === 'dg_tomb' ? 14 : themed === 18 ? 18 : 10, obelisk: theme === 'dg_grotto' ? 15 : 13, gravestone: 18, crate: 20, signpost: 19,
    stump: 23, well: 24, anvil: 25, tent: 26, goblin_tent: 27, lamp_post: 28, campfire: 29, haystack: 30, thorn_throne: 31, planter: 32,
  } as Record<string, number>)[draw] ?? null;
}

export function paintEnvironmentObject(kind: ObjectKindDef, theme: string, variant: number): HTMLCanvasElement | null {
  if (!props || !common) return null;
  const index = propIndex(theme, kind.draw); if (index == null) return null;
  let sprite = sprites.get(index);
  if (!sprite) {
    const source = index < 21 ? props : common;
    const k = index - 21, col = k % 4, row = Math.floor(k / 4);
    const c = index < 21 ? propCell(source, index) : { x: Math.round(col * source.width / 4), y: Math.round(row * source.height / 3), w: Math.round((col + 1) * source.width / 4) - Math.round(col * source.width / 4), h: Math.round((row + 1) * source.height / 3) - Math.round(row * source.height / 3) };
    const sample = makeCanvas(c.w, c.h);
    sample.ctx.drawImage(source, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
    const pixels = sample.ctx.getImageData(0, 0, c.w, c.h).data;
    let left = c.w, top = c.h, right = -1, bottom = -1;
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (pixels[(y * c.w + x) * 4 + 3] > 24) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    if (right < left) return null;
    sprite = makeCanvas(right - left + 1, bottom - top + 1).canvas;
    sprite.getContext('2d')!.drawImage(sample.canvas, left, top, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height);
    sprites.set(index, sprite);
  }
  const { canvas, ctx } = makeCanvas(kind.spriteW, kind.spriteH);
  const scale = Math.min((canvas.width - 4) / sprite.width, (canvas.height - 5) / sprite.height) * (1 - (variant % 4) * 0.025);
  const w = Math.round(sprite.width * scale), h = Math.round(sprite.height * scale);
  // Match the original footprint's bottom anchor and preserve all branch/crystal tips.
  if (variant >= 4 && kind.draw !== 'signpost') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(sprite, Math.round((canvas.width - w) / 2), canvas.height - 3 - h, w, h);
  return canvas;
}
