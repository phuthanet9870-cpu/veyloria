// Texture registry: generated environment atlases and procedural characters/FX.
import Phaser from 'phaser';
import type { GameData } from '../core/data';
import type { CompiledMap } from '../core/mapCompiler';
import type { MonsterDef } from '../core/types';
import { generateCharacterSheet, type CharacterLook } from './art/characterSprite';
import { generateMonsterSheet } from './art/monsterSprite';
import { paintAboveLayer, paintBuilding, paintGroundLayer, paintObject, paintWallLayer } from './art/mapPainter';
import { CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_SHEET_COLS, MON_SHEET_COLS } from './art/spriteMeta';
import { hashString } from '../core/rng';
import { makeCanvas, ellipse } from './art/canvas';
import { itemIconCanvas } from './art/icons';
import type { ItemDef } from '../core/types';
import { paintEnvironmentObject } from './art/environmentArt';

function addCanvasSheet(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, fw: number, fh: number, cols: number, rows: number) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tex.add(r * cols + c, 0, c * fw, r * fh, fw, fh);
  return tex;
}

export function lookKey(look: CharacterLook): string {
  return `chr_${hashString(JSON.stringify(look)).toString(36)}`;
}

/** Character sheet (player or NPC). */
export function ensureCharacterTexture(scene: Phaser.Scene, look: CharacterLook): string {
  const key = lookKey(look);
  if (!scene.textures.exists(key)) {
    addCanvasSheet(scene, key, generateCharacterSheet(look), CHAR_FRAME_W, CHAR_FRAME_H, CHAR_SHEET_COLS, CHAR_DIRECTIONS.length);
  }
  return key;
}

export function ensureMonsterTexture(scene: Phaser.Scene, def: MonsterDef): string {
  const key = `mon_${def.id}`;
  if (scene.textures.exists(key)) return key;
  addCanvasSheet(scene, key, generateMonsterSheet(def), def.art.w, def.art.h, MON_SHEET_COLS, 1);
  return key;
}

export interface MapTextures { objects: Map<string, string>; buildings: string[] }

/** Builds the object and building sprites of a map. Layers are painted per chunk (ensureMapChunk). */
export function ensureMapTextures(scene: Phaser.Scene, data: GameData, map: CompiledMap): MapTextures {
  const id = map.def.id;
  const pal = data.tilesets.get(map.def.tileset)!.palette;
  const add = (key: string, make: () => HTMLCanvasElement) => {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
    return key;
  };
  const objects = new Map<string, string>();
  for (const o of map.objects) {
    const kind = data.objectKinds.get(o.kind)!;
    const variant = ((o.x * 7 + o.y * 13) >>> 0) % 8;
    const key = add(`obj_${map.def.tileset}_${o.kind}_${variant}`, () => paintEnvironmentObject(kind, map.def.tileset, variant) ?? paintObject(kind, pal, 1000 + variant * 77 + hashString(o.kind)));
    objects.set(o.uid, key);
  }
  const buildings = map.buildings.map((b, i) => add(`map_${id}_bld${i}`, () => paintBuilding(b, pal)));
  return { objects, buildings };
}

/** Map layers are drawn in square chunks of this many tiles. */
export const CHUNK_TILES = 16;
export type ChunkLayers = { ground: string; walls: string | null; above: string | null };
export const chunkKey = (map: CompiledMap, layer: string, cx: number, cy: number) => `mc_${map.def.id}_${layer}_${cx}_${cy}`;

/** Paints one chunk (ground, and walls / above-player only when the chunk has any). Returns texture keys. */
export function ensureMapChunk(scene: Phaser.Scene, data: GameData, map: CompiledMap, cx: number, cy: number): ChunkLayers {
  const region = { x: cx * CHUNK_TILES, y: cy * CHUNK_TILES, w: Math.min(CHUNK_TILES, map.width - cx * CHUNK_TILES), h: Math.min(CHUNK_TILES, map.height - cy * CHUNK_TILES) };
  const has = (layer: (string | null | undefined)[]) => {
    for (let y = Math.max(0, region.y - 1); y < Math.min(map.height, region.y + region.h + 1); y++)
      for (let x = Math.max(0, region.x - 1); x < Math.min(map.width, region.x + region.w + 1); x++) if (layer[y * map.width + x]) return true;
    return false;
  };
  const keys: ChunkLayers = { ground: chunkKey(map, 'ground', cx, cy), walls: has(map.wall) ? chunkKey(map, 'walls', cx, cy) : null, above: has(map.above) ? chunkKey(map, 'above', cx, cy) : null };
  if (scene.textures.exists(keys.ground)) return keys;
  const pal = data.tilesets.get(map.def.tileset)!.palette;
  scene.textures.addCanvas(keys.ground, paintGroundLayer(map, pal, region));
  if (keys.walls) scene.textures.addCanvas(keys.walls, paintWallLayer(map, pal, region));
  if (keys.above) scene.textures.addCanvas(keys.above, paintAboveLayer(map, pal, region));
  return keys;
}

/** Frees one chunk's textures. */
export function releaseMapChunk(scene: Phaser.Scene, keys: ChunkLayers) {
  for (const k of [keys.ground, keys.walls, keys.above]) if (k && scene.textures.exists(k)) scene.textures.remove(k);
}

/** Small shared FX textures. */
export function ensureFxTextures(scene: Phaser.Scene) {
  const soft = (key: string, r: number) => {
    if (scene.textures.exists(key)) return;
    const { canvas, ctx } = makeCanvas(r * 2, r * 2);
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r * 2, r * 2);
    scene.textures.addCanvas(key, canvas);
  };
  soft('fx_dot', 8);
  soft('fx_glow', 32);
  if (!scene.textures.exists('fx_spark')) {
    const { canvas, ctx } = makeCanvas(8, 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(3, 0, 2, 8); ctx.fillRect(0, 3, 8, 2);
    scene.textures.addCanvas('fx_spark', canvas);
  }
  if (!scene.textures.exists('fx_arrow')) {
    const { canvas, ctx } = makeCanvas(20, 4);
    ctx.fillStyle = '#7a5634'; ctx.fillRect(2, 1, 14, 2); ctx.fillStyle = '#d8dde8'; ctx.fillRect(16, 0, 4, 4); ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, 3, 4);
    scene.textures.addCanvas('fx_arrow', canvas);
  }
  if (!scene.textures.exists('fx_item')) {
    const { canvas, ctx } = makeCanvas(16, 16);
    ellipse(ctx, 8, 8, 6, 6, '#ffffff');
    scene.textures.addCanvas('fx_item', canvas);
  }
}

/** Gravestone texture for MVP tombstones. */
export function ensureTombstoneTexture(scene: Phaser.Scene, data: GameData, tileset: string): string {
  const key = `obj_mvp_tombstone_${tileset}`;
  if (!scene.textures.exists(key)) {
    const kind = data.objectKinds.get('gravestone')!;
    scene.textures.addCanvas(key, paintObject(kind, data.tilesets.get(tileset)!.palette, 4242));
  }
  return key;
}

export function ensureItemTexture(scene: Phaser.Scene, def: ItemDef): string {
  const key = `icon_item_${def.id}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, itemIconCanvas(def));
  return key;
}
