// Compiles a data-driven MapDef into concrete tile layers, placed objects and a
// collision grid. Collision is derived from the same tile/object definitions
// the renderer draws, so what blocks the player always matches the artwork.
import type { GameData } from './data';
import { Rng, hashString } from './rng';
import type { MapDef, Rect } from './types';

export const TILE = 32;

export interface PlacedObject {
  uid: string;
  id?: string;
  kind: string;
  x: number; y: number; w: number; h: number;
  blocks: boolean;
}

export interface PlacedBuilding {
  x: number; y: number; w: number; h: number;
  style: string;
  door?: number;
  sign?: string;
}

export interface CompiledMap {
  def: MapDef;
  width: number;
  height: number;
  ground: string[];
  deco: (string | null)[];
  wall: (string | null)[];
  above: (string | null)[];
  objects: PlacedObject[];
  buildings: PlacedBuilding[];
  /** 1 = blocked. */
  collision: Uint8Array;
  /** 1 = reachable on foot from the default spawn. */
  reachable: Uint8Array;
}

const NATURAL_GROUND = new Set(['grass', 'grass_dark', 'forest_floor']);
const NO_DECO_GROUND = new Set(['dirt', 'path_stone', 'ruin_floor', 'water', 'sand', 'soil', 'wood_plank']);

export function compileMap(data: GameData, def: MapDef): CompiledMap {
  const W = def.width, H = def.height, N = W * H;
  const idx = (x: number, y: number) => y * W + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  const ground: string[] = new Array(N).fill(def.base);
  const deco: (string | null)[] = new Array(N).fill(null);
  const wall: (string | null)[] = new Array(N).fill(null);
  const above: (string | null)[] = new Array(N).fill(null);
  const reserved = new Uint8Array(N);
  const objectAt = new Int32Array(N).fill(-1);
  const buildingCell = new Uint8Array(N);
  const objects: PlacedObject[] = [];
  const buildings: PlacedBuilding[] = [];

  const reserveRect = (r: Rect, margin = 0) => {
    for (let y = r.y - margin; y < r.y + r.h + margin; y++)
      for (let x = r.x - margin; x < r.x + r.w + margin; x++) if (inside(x, y)) reserved[idx(x, y)] = 1;
  };

  // Key points must stay open: portals, spawns, NPCs, interactive objects, boss arena.
  for (const p of def.portals) reserveRect(p, 1);
  for (const s of Object.values(def.spawnPoints)) reserveRect({ x: s.x, y: s.y, w: 1, h: 1 }, 1);
  for (const n of def.npcs) reserveRect({ x: n.x, y: n.y, w: 1, h: 1 }, 1);
  if (def.bossSpawn) reserveRect({ x: def.bossSpawn.x, y: def.bossSpawn.y, w: 1, h: 1 }, 3);

  // Border thicket, opened where portals sit.
  const t = def.border.thickness;
  const inPortal = (x: number, y: number) => def.portals.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const edge = x < t || y < t || x >= W - t || y >= H - t;
      if (edge && !inPortal(x, y)) wall[idx(x, y)] = def.border.kind;
    }
  }
  for (let x = t; x < W - t; x++) above[idx(x, t - 1)] = 'canopy_overhang';

  const placeObject = (kind: string, x: number, y: number, id?: string): boolean => {
    const k = data.objectKinds.get(kind);
    if (!k) throw new Error(`Map ${def.id}: unknown object kind ${kind}`);
    const o: PlacedObject = { uid: `${def.id}:${objects.length}`, id, kind, x, y, w: k.footprint.w, h: k.footprint.h, blocks: k.blocks };
    for (let yy = y; yy < y + o.h; yy++) for (let xx = x; xx < x + o.w; xx++) {
      if (!inside(xx, yy)) return false;
      objectAt[idx(xx, yy)] = objects.length;
    }
    objects.push(o);
    return true;
  };

  const setGround = (x: number, y: number, tile: string, layer: 'ground' | 'deco' | 'wall' = 'ground') => {
    if (!inside(x, y)) return;
    const i = idx(x, y);
    if (layer === 'ground') ground[i] = tile;
    else if (layer === 'deco') deco[i] = tile;
    else wall[i] = tile;
  };

  for (const op of def.paint) {
    switch (op.op) {
      case 'rect': {
        for (let y = op.y; y < op.y + op.h; y++) for (let x = op.x; x < op.x + op.w; x++) setGround(x, y, op.tile, op.layer ?? 'ground');
        reserveRect(op);
        break;
      }
      case 'path': {
        for (let s = 0; s < op.points.length - 1; s++) {
          const [ax, ay] = op.points[s];
          const [bx, by] = op.points[s + 1];
          const len = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
          const steps = Math.max(1, Math.ceil(len * 4));
          for (let k = 0; k <= steps; k++) {
            const px = Math.round(ax + ((bx - ax) * k) / steps);
            const py = Math.round(ay + ((by - ay) * k) / steps);
            for (let j = 0; j < op.width; j++) for (let i = 0; i < op.width; i++) {
              const x = px + i, y = py + j;
              if (!inside(x, y)) continue;
              ground[idx(x, y)] = op.tile;
              // Paths clear walls inside the map, but only open the border where a portal sits.
              const onEdge = x < t || y < t || x >= W - t || y >= H - t;
              if (wall[idx(x, y)] && (!onEdge || inPortal(x, y))) wall[idx(x, y)] = null;
              reserved[idx(x, y)] = 1;
            }
          }
        }
        break;
      }
      case 'blob': {
        const rng = new Rng(op.seed ?? hashString(`${def.id}${op.cx}${op.cy}`));
        for (let y = Math.floor(op.cy - op.ry - 1); y <= op.cy + op.ry + 1; y++) {
          for (let x = Math.floor(op.cx - op.rx - 1); x <= op.cx + op.rx + 1; x++) {
            if (!inside(x, y) || x < t || y < t || x >= W - t || y >= H - t) continue;
            const d = ((x - op.cx) / op.rx) ** 2 + ((y - op.cy) / op.ry) ** 2;
            if (d <= 1 + (rng.next() - 0.5) * 0.35) setGround(x, y, op.tile, op.layer ?? 'ground');
          }
        }
        break;
      }
      case 'building': {
        buildings.push({ x: op.x, y: op.y, w: op.w, h: op.h, style: op.style, door: op.door, sign: op.sign });
        for (let y = op.y; y < op.y + op.h; y++) for (let x = op.x; x < op.x + op.w; x++) if (inside(x, y)) buildingCell[idx(x, y)] = 1;
        reserveRect(op, 1);
        if (op.door != null) reserveRect({ x: op.x + op.door - 1, y: op.y + op.h, w: 3, h: 2 });
        break;
      }
      case 'object': {
        placeObject(op.kind, op.x, op.y, op.id);
        const k = data.objectKinds.get(op.kind)!;
        reserveRect({ x: op.x, y: op.y, w: k.footprint.w, h: k.footprint.h }, 1);
        break;
      }
      case 'fence': {
        for (let i = 0; i < op.length; i++) {
          const x = op.dir === 'h' ? op.x + i : op.x;
          const y = op.dir === 'h' ? op.y : op.y + i;
          setGround(x, y, op.dir === 'h' ? 'fence_h' : 'fence_v', 'wall');
          if (inside(x, y)) reserved[idx(x, y)] = 1;
        }
        break;
      }
      case 'clear': {
        reserveRect(op);
        break;
      }
      case 'scatter': {
        const rng = new Rng(op.seed);
        const area = op.area ?? { x: t, y: t, w: W - 2 * t, h: H - 2 * t };
        const isDeco = op.kind.startsWith('deco:');
        const decoTile = isDeco ? op.kind.slice(5) : '';
        const k = isDeco ? null : data.objectKinds.get(op.kind)!;
        for (let y = area.y; y < area.y + area.h; y++) {
          for (let x = area.x; x < area.x + area.w; x++) {
            if (!inside(x, y) || !rng.chance(op.density)) continue;
            const i = idx(x, y);
            if (wall[i] || objectAt[i] >= 0 || buildingCell[i]) continue;
            if (isDeco) {
              const g = data.tiles.get(ground[i]);
              if (!g?.walkable || NO_DECO_GROUND.has(ground[i]) || deco[i]) continue;
              deco[i] = decoTile;
            } else {
              let fits = true;
              for (let yy = y; yy < y + k!.footprint.h && fits; yy++) for (let xx = x; xx < x + k!.footprint.w; xx++) {
                if (!inside(xx, yy)) { fits = false; break; }
                const j = idx(xx, yy);
                if (reserved[j] || wall[j] || objectAt[j] >= 0 || buildingCell[j] || !NATURAL_GROUND.has(ground[j])) { fits = false; break; }
              }
              if (fits) placeObject(op.kind, x, y);
            }
          }
        }
        break;
      }
    }
  }

  // Collision grid.
  const collision = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const g = data.tiles.get(ground[i]);
    const w = wall[i] ? data.tiles.get(wall[i]!) : null;
    if (!g?.walkable || (w && !w.walkable) || buildingCell[i]) collision[i] = 1;
    const o = objectAt[i] >= 0 ? objects[objectAt[i]] : null;
    if (o?.blocks) collision[i] = 1;
  }
  for (const n of def.npcs) if (inside(n.x, n.y)) collision[idx(n.x, n.y)] = 1;

  // Reachability flood fill from the default spawn (4-neighbour).
  const reachable = new Uint8Array(N);
  const start = def.spawnPoints.default ?? Object.values(def.spawnPoints)[0];
  const queue: number[] = [];
  if (start && !collision[idx(start.x, start.y)]) { reachable[idx(start.x, start.y)] = 1; queue.push(idx(start.x, start.y)); }
  while (queue.length) {
    const cur = queue.pop()!;
    const cx = cur % W, cy = Math.floor(cur / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!inside(nx, ny)) continue;
      const j = idx(nx, ny);
      if (!collision[j] && !reachable[j]) { reachable[j] = 1; queue.push(j); }
    }
  }

  return { def, width: W, height: H, ground, deco, wall, above, objects, buildings, collision, reachable };
}

export function isBlockedCell(map: CompiledMap, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return true;
  return map.collision[cy * map.width + cx] === 1;
}

/** True if an axis-aligned feet box centred at (x,y) overlaps any blocked tile. */
export function boxBlocked(map: CompiledMap, x: number, y: number, halfW: number, halfH: number): boolean {
  const x0 = Math.floor((x - halfW) / TILE), x1 = Math.floor((x + halfW - 0.001) / TILE);
  const y0 = Math.floor((y - halfH) / TILE), y1 = Math.floor((y + halfH - 0.001) / TILE);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (isBlockedCell(map, cx, cy)) return true;
  return false;
}

/** Moves with axis-separated collision; returns the resolved position. */
export function moveWithCollision(
  map: CompiledMap, x: number, y: number, dx: number, dy: number, halfW: number, halfH: number,
): { x: number; y: number; blocked: boolean } {
  let nx = x, ny = y, blocked = false;
  if (dx !== 0) {
    if (!boxBlocked(map, x + dx, y, halfW, halfH)) nx = x + dx;
    else blocked = true;
  }
  if (dy !== 0) {
    if (!boxBlocked(map, nx, y + dy, halfW, halfH)) ny = y + dy;
    else blocked = true;
  }
  return { x: nx, y: ny, blocked };
}

export function cellCenter(cx: number, cy: number): { x: number; y: number } {
  return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
}
