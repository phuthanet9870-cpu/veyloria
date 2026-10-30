import buildingUrl from '../../assets/environment/architecture-buildings.png';
import castleUrl from '../../assets/environment/architecture-castles.png';
import type { PlacedBuilding } from '../../core/mapCompiler';
import { TILE } from '../../core/mapCompiler';
import { makeCanvas } from './canvas';
import { architectureTheme, ARCHITECTURE_ALIASES, ARCHITECTURE_STYLES, BUILDING_COLUMNS, BUILDING_ROWS_BY_COLUMN, CASTLE_COLUMNS, CASTLE_ROWS, type ArchitecturePart } from './architectureManifest';
import { aurelionFrame, AURELION_BUILDINGS, loadAurelionArt } from './aurelionArt';

let buildings: HTMLImageElement | undefined, castles: HTMLImageElement | undefined;
let loading: Promise<void> | undefined;
const frames = new Map<string, HTMLCanvasElement>();

export function loadArchitectureArt(): Promise<void> {
  return loading ??= Promise.all([buildingUrl, castleUrl].map(url => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Architecture atlas could not load: ${url}`)); image.src = url;
  }))).then(async ([a, b]) => { buildings = a; castles = b; await loadAurelionArt(); });
}

/** Trim a complete sprite within its reviewed frame; every chimney stays intact. */
export function architectureFrame(theme: string, style: string): HTMLCanvasElement | null {
  if (!buildings || !castles) return null;
  if(AURELION_BUILDINGS[style]!=null)return aurelionFrame(AURELION_BUILDINGS[style]);
  const alias=ARCHITECTURE_ALIASES[style];if(alias){theme=alias.theme;style=alias.style;}
  const row = architectureTheme(theme), column = ARCHITECTURE_STYLES.indexOf(style as typeof ARCHITECTURE_STYLES[number]);
  const part = (['castle', 'gate', 'wall'] as string[]).indexOf(style);
  const key = `${row}:${style}`;
  const cached = frames.get(key); if (cached) return cached;
  if (column < 0 && part < 0) return null;
  const image = part >= 0 ? castles : buildings;
  const xx = part >= 0 ? CASTLE_COLUMNS : BUILDING_COLUMNS;
  const yy = part >= 0 ? CASTLE_ROWS : BUILDING_ROWS_BY_COLUMN[column];
  const cx = part >= 0 ? row : column, cy = part >= 0 ? part : row;
  const x = xx[cx], y = yy[cy], w = xx[cx + 1] - x, h = yy[cy + 1] - y;
  const sample = makeCanvas(w, h); sample.ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  const pixels = sample.ctx.getImageData(0, 0, w, h).data;
  let left = w, top = h, right = -1, bottom = -1;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) if (pixels[(py * w + px) * 4 + 3] > 24) {
    left = Math.min(left, px); top = Math.min(top, py); right = Math.max(right, px); bottom = Math.max(bottom, py);
  }
  if (right < left) throw new Error(`Empty architecture frame ${key}`);
  const trimmed = makeCanvas(right - left + 1, bottom - top + 1);
  trimmed.ctx.drawImage(sample.canvas, left, top, trimmed.canvas.width, trimmed.canvas.height, 0, 0, trimmed.canvas.width, trimmed.canvas.height);
  frames.set(key, trimmed.canvas); return trimmed.canvas;
}

/** Same bottom anchor and 4px side padding as existing building placement. */
export function paintArchitectureBuilding(b: PlacedBuilding, theme: string): HTMLCanvasElement | null {
  const source = architectureFrame(theme, b.style); if (!source) return null;
  const width = b.w * TILE;
  const height = Math.max(32, Math.min(Math.round(source.height * width / source.width), (b.y + b.h) * TILE - 8));
  const { canvas, ctx } = makeCanvas(width + 8, height + 8);
  const door = b.door == null ? width / 2 : (b.door + 0.5) * TILE;
  // The workshop's front opening is beside its chimney; the rustic inn is
  // asymmetric. Map that authored opening to the existing reserved doorway.
  const entrance = b.style === 'smithy' ? 0.34 : b.style === 'inn' && architectureTheme(theme) === 0 ? 0.37 : 0.5;
  const cut = Math.round(source.width * entrance);
  ctx.drawImage(source, 0, 0, cut, source.height, 4, 4, door, height);
  ctx.drawImage(source, cut, 0, source.width - cut, source.height, 4 + door, 4, width - door, height);
  if (b.sign) {
    // Keep a readable service label without painting over the front entrance.
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const labelWidth = Math.min(width - 12, ctx.measureText(b.sign).width + 12), labelY = Math.max(12, height - 42);
    ctx.fillStyle = '#241b20ee'; ctx.fillRect(4 + door - labelWidth / 2, labelY - 7, labelWidth, 14);
    ctx.fillStyle = '#f5dfa2'; ctx.fillText(b.sign, 4 + door, labelY, labelWidth - 8);
  }
  return canvas;
}

/** Castle wall and gate kit; never rotated or mirrored. */
export function paintArchitecturePart(theme: string, part: ArchitecturePart, width: number, height?: number, opening?: number): HTMLCanvasElement | null {
  const source = architectureFrame(theme, part); if (!source) return null;
  const targetHeight = height ?? Math.round(source.height * width / source.width);
  const { canvas, ctx } = makeCanvas(width + 8, targetHeight + 8);
  ctx.drawImage(source, 4, 4, width, targetHeight);
  if (part === 'gate' && opening) {
    // A visible opening must match the already walkable courtyard gap exactly.
    const side = (width - opening) / 2;
    ctx.clearRect(4 + side, targetHeight - TILE + 4, opening, TILE + 4);
  }
  return canvas;
}
