// Renders the World simulation with Phaser and turns mouse input into world
// commands. All game rules live in src/core; this scene only draws them.
import { homunStats } from '../../core/homunculus';
import Phaser from 'phaser';
import { paintArchitecturePart } from '../art/architectureArt';
import type { World, WorldEvent, MonsterActor, AnimState } from '../../core/world';
import { TILE } from '../../core/mapCompiler';
import type { Direction } from '../../core/types';
import { npcQuestMarker } from '../../core/quests';
import {
  CHUNK_TILES, ensureCharacterTexture, ensureFxTextures, ensureItemTexture, ensureMapChunk, ensureMapTextures, ensureMonsterTexture, ensureTombstoneTexture,
  releaseMapChunk, type ChunkLayers,
} from '../assets';
import type { CharacterLook } from '../art/characterSprite';
import { CHAR_ANIMS, CHAR_DIRECTIONS, CHAR_PIVOT, CHAR_SHEET_COLS, MON_ANIMS, MON_SHEET_COLS, type CharAnim, type MonAnim } from '../art/spriteMeta';
import { clipFrame, type Clip, type Rig } from '../rig';
import { ELEMENT_FX, floatText, playFx, playProjectile } from '../render/effects';
import { audio } from '../audio/audio';
import type { GameHost } from '../host';
import { titleOf } from '../../core/achievements';

interface MonView { sprite: Phaser.GameObjects.Sprite; name: Phaser.GameObjects.Text; deadAt: number; rig: Rig }
interface NpcView { sprite: Phaser.GameObjects.Sprite; name: Phaser.GameObjects.Text; marker: Phaser.GameObjects.Text }

const ZOOM = 1.5;

export class GameScene extends Phaser.Scene {
  host!: GameHost;
  world!: World;
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private player!: Phaser.GameObjects.Sprite;
  private playerName!: Phaser.GameObjects.Text;
  private playerLookKey = '';
  private playerRig!: Rig;
  private monViews = new Map<string, MonView>();
  private npcViews = new Map<string, NpcView>();
  private groundViews = new Map<string, Phaser.GameObjects.Image>();
  private groundGlows = new Map<string, Phaser.GameObjects.Image>();
  private zoneEmitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private gfx!: Phaser.GameObjects.Graphics; // telegraphs, zones, cast circle
  private bars!: Phaser.GameObjects.Graphics; // hp bars
  private collisionGfx: Phaser.GameObjects.Graphics | null = null;
  /** Painted map chunks around the camera (streamed in and out as it moves). */
  private chunks = new Map<string, { keys: ChunkLayers; imgs: Phaser.GameObjects.Image[] }>();
  /** Ragnarok-style cell cursor: the tile under the mouse, and the tile the player is walking to. */
  private cellCursor!: Phaser.GameObjects.Graphics;
  private gridGfx: Phaser.GameObjects.Graphics | null = null;
  private moveTargetCell: { x: number; y: number; at: number } | null = null;
  private hovered: { kind: 'monster' | 'npc' | 'item' | 'object' | null; id: string | null } = { kind: null, id: null };
  private markerTimer = 0;
  private stepTimer = 0;
  private builtMapId = '';
  private builtMap: World['map'] | null = null;
  private remoteViews = new Map<string, { sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics; rig: Rig | null; lookKey: string }>();
  /** Other players (drawn with their own look) and the castle Emperium. */
  private syncRemotes() {
    const w = this.world;
    for (const [id, v] of this.remoteViews) if (!w.remotes.has(id) || !v.sprite.active) { v.sprite.destroy(); v.name.destroy(); v.bar.destroy(); this.remoteViews.delete(id); }
    for (const r of w.remotes.values()) {
      const lookKey = r.emperium ? 'emp' : JSON.stringify(r.info?.look ?? {});
      let v = this.remoteViews.get(r.id);
      if (v && v.lookKey !== lookKey) { v.sprite.destroy(); v.name.destroy(); v.bar.destroy(); this.remoteViews.delete(r.id); v = undefined; }
      if (!v) {
        let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, rig: Rig | null = null;
        if (r.emperium) {
          const def = w.data.monsters.get('crystal_slime')!;
          rig = proceduralMonRig(ensureMonsterTexture(this, def));
          sprite = this.track(this.add.sprite(r.x, r.y, rig.clips.idle.key, 0).setOrigin(0.5, 1).setScale(1.6).setTint(0xffe27a));
        } else {
          rig = proceduralCharRig(ensureCharacterTexture(this, r.info!.look as never));
          sprite = this.track(this.add.sprite(r.x, r.y, rig.clips.idle.key, 0).setOrigin(rig.originX, rig.originY));
        }
        const name = this.track(this.add.text(r.x, r.y + 6, '', labelStyle(r.emperium ? '#ffe27a' : '#9ad8ff')).setOrigin(0.5, 0).setDepth(1e5 + 2).setResolution(2));
        const bar = this.track(this.add.graphics().setDepth(1e5 + 1));
        v = { sprite, name, bar, rig, lookKey };
        this.remoteViews.set(r.id, v);
      }
      v.sprite.setPosition(Math.round(r.x), Math.round(r.y)).setDepth(r.y);
      if (v.rig && v.sprite instanceof Phaser.GameObjects.Sprite) {
        const clip = v.rig.clips[r.emperium ? 'idle' : toCharAnim(r.anim as AnimState)] ?? v.rig.clips.idle;
        const fr = clipFrame(clip, r.dir, this.clipStep(clip, 0));
        v.sprite.setTexture(clip.key, fr.frame).setFlipX(fr.flipX);
      }
      const p = r.info;
      v.name.setText(r.emperium ? r.name : `${r.name}${p?.title ? `\n« ${p.title} »` : ''}${p?.guild ? `\n<${p.guild}>` : ''}${p?.vending ? `\n🛒 ${p.vending}` : ''}`).setPosition(Math.round(r.x), Math.round(r.y) + 6);
      v.bar.clear().fillStyle(0x1c1622, 1).fillRect(r.x - 16, r.y + 2, 32, 4).fillStyle(r.emperium ? 0xffd34d : 0x6fe08a, 1).fillRect(r.x - 16, r.y + 2, Math.round(32 * Math.max(0, Math.min(1, r.hpPct))), 4);
    }
  }

  private homView: { key: string; sprite: Phaser.GameObjects.Sprite; name: Phaser.GameObjects.Text; rig: Rig; bar: Phaser.GameObjects.Graphics } | null = null;
  private petView: { petId: string; sprite: Phaser.GameObjects.Sprite; name: Phaser.GameObjects.Text; rig: Rig; heart: Phaser.GameObjects.Text } | null = null;
  private tombViews = new Map<string, { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();

  constructor() { super('Game'); }

  /** Visual effects (skill and hit effects, particles, weather, flashes, bobbing) — off unless turned on in Settings. */
  private get fxOn() { return this.host.settings.effects === true; }

  init(data: { host: GameHost }) {
    this.host = data.host;
    this.world = data.host.world;
  }

  create() {
    ensureFxTextures(this);
    this.cameras.main.setZoom(this.host.settings.zoom ?? ZOOM);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#0c0a12');
    this.input.mouse?.disableContextMenu();
    this.buildMap();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    // Mouse wheel zooms the camera (saved in the settings).
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => { if (dy) this.host.zoomBy?.(dy > 0 ? -1 : 1); });
    this.events.on('shutdown', () => this.clearMap());
  }

  // ---------------------------------------------------------------- map build
  private clearMap() {
    for (const o of this.mapObjects) o.destroy();
    this.mapObjects = [];
    this.monViews.clear();
    this.npcViews.clear();
    this.groundViews.clear();
    this.groundGlows.clear();
    for (const e of this.zoneEmitters.values()) e.destroy();
    this.zoneEmitters.clear();
    this.collisionGfx = null;
    this.gridGfx = null;
    this.tombViews.clear();
    for (const c of this.chunks.values()) { for (const i of c.imgs) i.destroy(); releaseMapChunk(this, c.keys); }
    this.chunks.clear();
  }

  /** Paints the chunks the camera can see (plus a one-chunk margin) and frees the far ones. */
  private updateChunks(all = false) {
    const map = this.world.map, view = this.cameras.main.worldView, span = CHUNK_TILES * TILE;
    const maxX = Math.ceil(map.width / CHUNK_TILES) - 1, maxY = Math.ceil(map.height / CHUNK_TILES) - 1;
    const cx0 = Math.max(0, Math.floor(view.x / span) - 1), cy0 = Math.max(0, Math.floor(view.y / span) - 1);
    const cx1 = Math.min(maxX, Math.floor((view.x + view.width) / span) + 1), cy1 = Math.min(maxY, Math.floor((view.y + view.height) / span) + 1);
    let budget = all ? Infinity : 2; // painting is spread over frames while walking
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const id = `${cx},${cy}`;
      if (this.chunks.has(id) || budget <= 0) continue;
      budget--;
      const keys = ensureMapChunk(this, this.world.data, map, cx, cy);
      const x = cx * span, y = cy * span;
      const imgs = [this.add.image(x, y, keys.ground).setOrigin(0).setDepth(-20)];
      if (keys.walls) imgs.push(this.add.image(x, y, keys.walls).setOrigin(0).setDepth(-10));
      if (keys.above) imgs.push(this.add.image(x, y, keys.above).setOrigin(0).setDepth(1e5));
      this.chunks.set(id, { keys, imgs });
    }
    for (const [id, c] of this.chunks) {
      const [cx, cy] = id.split(',').map(Number);
      if (cx >= cx0 - 1 && cx <= cx1 + 1 && cy >= cy0 - 1 && cy <= cy1 + 1) continue;
      for (const i of c.imgs) i.destroy();
      releaseMapChunk(this, c.keys);
      this.chunks.delete(id);
    }
  }

  /** Ragnarok-style cell cursor: four corner brackets on the cell under the mouse (green walkable, red blocked). */
  private drawCellCursor() {
    const g = this.cellCursor, w = this.world, map = w.map;
    // Recomputed every frame: the camera follows the player, so the cell under a still mouse changes.
    const pt = this.host.pointerWorld ? this.worldPoint(this.input.activePointer) : null;
    g.clear();
    // Over a monster, NPC or item the mouse pointer itself changes, so no cell is marked (as in Ragnarok).
    if (this.host.settings.cellCursor !== false && pt && !w.player.dead && !this.hovered.kind) {
      const tx = Math.floor(pt.x / TILE), ty = Math.floor(pt.y / TILE);
      if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height) {
        const free = !map.collision[ty * map.width + tx];
        cornerBrackets(g, tx * TILE, ty * TILE, free ? 0x6ff0c0 : 0xff6a6a, 0.95);
      }
    }
    // Destination of a click-walk: fainter brackets until the player arrives.
    const t = this.moveTargetCell;
    if (t && w.player.moving && this.time.now - t.at < 8000) cornerBrackets(g, t.x * TILE, t.y * TILE, 0xffffff, 0.45 + 0.25 * Math.sin(this.time.now / 140));
    else if (t && !w.player.moving) this.moveTargetCell = null;
  }

  /** Smooth camera zoom; the chunk streamer then fills in the newly visible area. */
  applyZoom(z: number) {
    this.tweens.killTweensOf(this.cameras.main);
    this.tweens.add({ targets: this.cameras.main, zoom: z, duration: 160, ease: 'Sine.easeOut' });
  }

  /** Optional faint grid over the walkable map (Settings → Show grid). */
  setGridVisible(on: boolean) {
    if (on && !this.gridGfx) {
      const map = this.world.map, g = this.track(this.add.graphics().setDepth(-9));
      g.lineStyle(1, 0xffffff, 0.08);
      for (let x = 0; x <= map.width; x++) g.lineBetween(x * TILE, 0, x * TILE, map.height * TILE);
      for (let y = 0; y <= map.height; y++) g.lineBetween(0, y * TILE, map.width * TILE, y * TILE);
      this.gridGfx = g;
    }
    if (!on && this.gridGfx) { this.gridGfx.destroy(); this.gridGfx = null; }
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T { this.mapObjects.push(o); return o; }

  buildMap() {
    this.clearMap();
    const w = this.world, map = w.map, data = w.data;
    this.builtMapId = map.def.id;
    this.builtMap = map;
    const tex = ensureMapTextures(this, data, map);
    const W = map.width * TILE, H = map.height * TILE;

    for (const o of map.objects) {
      const kind = data.objectKinds.get(o.kind)!;
      const key = tex.objects.get(o.uid)!;
      const bx = (o.x + o.w / 2) * TILE, by = (o.y + o.h) * TILE;
      const img = this.track(this.add.image(bx, by + 2, key).setOrigin(0.5, 1).setDepth(by - 1));
      if (kind.id === 'glint') {
        img.setDepth(-5).setBlendMode(Phaser.BlendModes.ADD).setY(by - 6);
        if (this.fxOn) this.tweens.add({ targets: img, alpha: { from: 0.3, to: 1 }, scale: { from: 0.7, to: 1.1 }, yoyo: true, repeat: -1, duration: 700 });
      }
      if (kind.id === 'campfire' && this.fxOn) {
        const em = this.track(this.add.particles(bx, by - 14, 'fx_dot', {
          speed: { min: 10, max: 30 }, angle: { min: 250, max: 290 }, lifespan: 700, scale: { start: 0.6, end: 0 },
          tint: [0xff7a2e, 0xffd34d], blendMode: Phaser.BlendModes.ADD, frequency: 90, gravityY: -30,
        }).setDepth(by));
        void em;
      }
      if (kind.id === 'obelisk' && this.fxOn) {
        this.track(this.add.particles(bx, by - 50, 'fx_spark', {
          speed: { min: 5, max: 20 }, lifespan: 1200, scale: { start: 0.5, end: 0 }, tint: [0x9ad8ff, 0xffffff],
          blendMode: Phaser.BlendModes.ADD, frequency: 220, gravityY: -20, emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-10, -40, 20, 80) } as never,
        }).setDepth(by + 1));
      }
    }
    map.buildings.forEach((b, i) => {
      const img = this.add.image(b.x * TILE - 4, (b.y + b.h) * TILE + 4, tex.buildings[i]).setOrigin(0, 1).setDepth((b.y + b.h) * TILE - 2);
      this.track(img);
    });

    if (map.def.id === 'castle_veyl') {
      // Art is anchored on the existing blocked wall cells. The four-cell
      // central approach to the Emperium remains open and keeps its collision.
      const kit = (part: 'wall' | 'gate', x: number, width: number, height: number, opening?: number) => {
        const key = `architecture_capital_${part}_${width}_${height}`;
        if (!this.textures.exists(key)) {
          const canvas = paintArchitecturePart('capital', part, width, height, opening);
          if (!canvas) throw new Error(`Missing castle ${part} artwork`);
          this.textures.addCanvas(key, canvas);
        }
        this.track(this.add.image(x * TILE - 4, 15 * TILE + 4, key).setOrigin(0, 1).setDepth(15 * TILE - (part === 'gate' ? 1 : 2)));
      };
      for (const x of [6, 10, 14, 22, 26, 30]) kit('wall', x, 4 * TILE, 3 * TILE);
      kit('gate', 17, 6 * TILE, 5 * TILE, 4 * TILE);
    }

    // Portals
    for (const p of map.def.portals) {
      const cx = (p.x + p.w / 2) * TILE, cy = (p.y + p.h / 2) * TILE;
      const glow = this.track(this.add.ellipse(cx, cy + 6, p.w * TILE + 10, p.h * TILE * 0.6, 0x7fd6ff, 0.25).setDepth(-4).setBlendMode(Phaser.BlendModes.ADD));
      if (this.fxOn) this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.45 }, yoyo: true, repeat: -1, duration: 900 });
      if (this.fxOn) this.track(this.add.particles(cx, cy, 'fx_spark', {
        speed: { min: 5, max: 25 }, angle: { min: 260, max: 280 }, lifespan: 1400, scale: { start: 0.6, end: 0 },
        tint: [0x7fd6ff, 0xffffff], blendMode: Phaser.BlendModes.ADD, frequency: 120, gravityY: -40,
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-p.w * 16, -p.h * 16, p.w * 32, p.h * 32) } as never,
      }).setDepth(cy + 40));
      const label = this.track(this.add.text(cx, cy - p.h * 16 - 10, `▶ ${p.label}`, labelStyle('#bfe9ff')).setOrigin(0.5).setDepth(1e5 + 1));
      label.setResolution(2);
    }

    // NPCs
    for (const n of w.npcs) {
      const look: CharacterLook = { appearance: n.def.appearance, outfit: n.def.outfit, weapon: null };
      const key = ensureCharacterTexture(this, look);
      const s = this.track(this.add.sprite(n.x, n.y, key, frameIndex(n.dir, 'idle', 0)).setOrigin(CHAR_PIVOT.x, CHAR_PIVOT.y));
      s.setDepth(n.y);
      const name = this.track(this.add.text(n.x, n.y + 6, n.def.name, labelStyle('#ffe9a8')).setOrigin(0.5, 0).setDepth(1e5 + 2).setResolution(2));
      const marker = this.track(this.add.text(n.x, n.y - 72, '', { fontFamily: 'Verdana', fontSize: '22px', fontStyle: 'bold', color: '#ffd34d', stroke: '#1c1622', strokeThickness: 5 }).setOrigin(0.5).setDepth(1e5 + 3).setResolution(2));
      if (this.fxOn) this.tweens.add({ targets: marker, y: n.y - 78, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
      this.npcViews.set(n.npcId, { sprite: s, name, marker });
    }

    // Player
    this.playerLookKey = '';
    this.player = this.track(this.add.sprite(w.player.x, w.player.y, '__DEFAULT'));
    this.ensurePlayerTexture();
    this.playerName = this.track(this.add.text(0, 0, w.char.name, labelStyle('#ffffff')).setOrigin(0.5, 0).setDepth(1e5 + 2).setResolution(2));

    this.gfx = this.track(this.add.graphics().setDepth(-3));
    this.bars = this.track(this.add.graphics().setDepth(1e5 + 5));

    // Map atmosphere tint (forest is darker).
    const TINT: Record<string, [number, number]> = {
      whispering_forest: [0x0a2a1a, 0.18], sunny_meadow: [0xfff2c0, 0.05], fernwood: [0x0a2a1a, 0.15], desert: [0xffc070, 0.08], volcano: [0x601000, 0.16],
      swamp: [0x102010, 0.22], ruins: [0x100818, 0.22], snow: [0xc8e0ff, 0.06], arcane: [0x2a1050, 0.08],
    };
    const [tintColor, tintAlpha] = TINT[map.def.tileset] ?? (map.def.type === 'dungeon' ? [0x000008, 0.3] : [0xffe0b0, 0.05]);
    this.track(this.add.rectangle(0, 0, W, H, tintColor, tintAlpha).setOrigin(0).setDepth(1e5 - 1));
    if (this.fxOn) this.addWeather(map.def.weather[0]);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.centerOn(this.player.x, this.player.y);
    cam.preRender();
    this.updateChunks(true);
    this.cellCursor = this.track(this.add.graphics().setDepth(-8));
    if (this.fxOn) cam.fadeIn(350, 0, 0, 0);
    if (this.host.settings.showCollision) this.drawCollision();
    if (this.host.settings.showGrid) this.setGridVisible(true);
    audio.playMusic(map.def.bgm);
    audio.playAmbient(map.def.ambient);
  }

  /** Screen-space weather particles: snow, rain, ash or drifting fog. */
  private addWeather(kind: string | undefined) {
    // Weather covers the view at the farthest zoom-out.
    const cam = this.cameras.main, vw = cam.width / 0.75, vh = cam.height / 0.75;
    const zone = { type: 'random', source: new Phaser.Geom.Rectangle(-40, -30, vw + 80, 10) } as never;
    const base = { emitZone: zone, scrollFactor: 0 } as Record<string, unknown>;
    let cfg: Record<string, unknown> | null = null;
    if (kind === 'snow') cfg = { ...base, speedY: { min: 20, max: 45 }, speedX: { min: -12, max: 12 }, lifespan: 9000, scale: { min: 0.15, max: 0.35 }, alpha: 0.85, frequency: 70, tint: 0xffffff };
    if (kind === 'rain') cfg = { ...base, speedY: { min: 380, max: 460 }, speedX: -40, lifespan: 1400, scaleX: 0.06, scaleY: 0.6, alpha: 0.45, frequency: 18, tint: 0x9ac8ff };
    if (kind === 'ash') cfg = { ...base, speedY: { min: 14, max: 30 }, speedX: { min: -20, max: 20 }, lifespan: 10000, scale: { min: 0.1, max: 0.25 }, alpha: { start: 0.9, end: 0.2 }, frequency: 90, tint: [0x8a7a72, 0xff8a3a, 0x5a4a44] };
    if (kind === 'fog') {
      const em = this.track(this.add.particles(0, 0, 'fx_glow', { emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-60, 0, vw + 120, vh) } as never, speedX: { min: 4, max: 10 }, lifespan: 12000, scale: { min: 2.5, max: 4 }, alpha: { start: 0, end: 0.12, ease: 'Sine.easeInOut' }, frequency: 500, tint: 0xd8e0e8 }));
      em.setScrollFactor(0).setDepth(1e5 - 0.5);
      return;
    }
    if (!cfg) return;
    const em = this.track(this.add.particles(0, 0, 'fx_dot', cfg as never));
    em.setScrollFactor(0).setDepth(1e5 - 0.5);
  }

  setCollisionVisible(on: boolean) {
    if (on && !this.collisionGfx) this.drawCollision();
    if (!on && this.collisionGfx) { this.collisionGfx.destroy(); this.collisionGfx = null; }
  }

  private drawCollision() {
    const map = this.world.map;
    const g = this.track(this.add.graphics().setDepth(1e5 + 10));
    g.fillStyle(0xff0040, 0.28);
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.collision[y * map.width + x]) g.fillRect(x * TILE, y * TILE, TILE, TILE);
    g.lineStyle(1, 0x7fd6ff, 0.8);
    for (const p of map.def.portals) g.strokeRect(p.x * TILE, p.y * TILE, p.w * TILE, p.h * TILE);
    g.lineStyle(1, 0xffd34d, 0.6);
    for (const s of map.def.monsterSpawns) g.strokeRect(s.area.x * TILE, s.area.y * TILE, s.area.w * TILE, s.area.h * TILE);
    this.collisionGfx = g;
  }

  /** Player rig: production art for classes that have it, else the procedural sheet. */
  private ensurePlayerTexture() {
    const c = this.world.char;
    const cls = this.world.data.classes.get(c.classId)!;
    const weapon = c.equipment.weapon ? this.world.data.items.get(c.equipment.weapon.itemId)?.weaponType ?? null : null;
    const lookId = JSON.stringify([c.classId, c.appearance, weapon, !!c.equipment.shield]);
    if (lookId === this.playerLookKey && this.playerRig) return;
    this.playerLookKey = lookId;
    const look: CharacterLook = { appearance: c.appearance, outfit: cls.outfit, weapon, shield: !!c.equipment.shield };
    this.playerRig = proceduralCharRig(ensureCharacterTexture(this, look));
    if (this.player?.active) this.player.setOrigin(this.playerRig.originX, this.playerRig.originY);
  }

  // ---------------------------------------------------------------- input
  worldPoint(p: Phaser.Input.Pointer) {
    return this.cameras.main.getWorldPoint(p.x, p.y);
  }

  private pick(wx: number, wy: number): { kind: 'monster' | 'npc' | 'item' | 'object' | null; id: string | null } {
    // Monsters (topmost first)
    let best: { id: string; depth: number } | null = null;
    for (const [id, v] of this.monViews) {
      const m = this.world.monsters.get(id);
      if (!m || m.dead) continue;
      const b = v.sprite.getBounds();
      Phaser.Geom.Rectangle.Inflate(b, 6, 6);
      if (b.contains(wx, wy) && (!best || v.sprite.depth > best.depth)) best = { id, depth: v.sprite.depth };
    }
    if (best) return { kind: 'monster', id: best.id };
    for (const [id, v] of this.npcViews) {
      const b = v.sprite.getBounds();
      Phaser.Geom.Rectangle.Inflate(b, -8, -4);
      if (b.contains(wx, wy)) return { kind: 'npc', id };
    }
    for (const [id, img] of this.groundViews) if (Phaser.Math.Distance.Between(img.x, img.y, wx, wy) < 18) return { kind: 'item', id };
    for (const o of this.world.map.def.objects) {
      const placed = this.world.map.objects.find((p) => p.id === o.id);
      if (!placed || !o.interact) continue;
      const kind = this.world.data.objectKinds.get(placed.kind)!;
      const cx = (placed.x + placed.w / 2) * TILE, by = (placed.y + placed.h) * TILE;
      if (wx > cx - kind.spriteW / 2 && wx < cx + kind.spriteW / 2 && wy > by - kind.spriteH && wy < by + 4) return { kind: 'object', id: o.id };
    }
    return { kind: null, id: null };
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    const wp = this.worldPoint(p);
    this.host.pointerWorld = { x: wp.x, y: wp.y };
    this.hovered = this.pick(wp.x, wp.y);
    const cursor = this.hovered.kind === 'monster' ? 'crosshair' : this.hovered.kind ? 'pointer' : 'default';
    this.input.setDefaultCursor(cursor);
  }

  private onPointerDown(p: Phaser.Input.Pointer) {
    audio.unlock();
    if (this.world.player.dead) return;
    const wp = this.worldPoint(p);
    if (this.world.auto.mode !== 'off') this.world.auto.stop('manual control');
    if (p.rightButtonDown()) { this.world.stop(); return; }
    // Other players / the Emperium: attack in PvP areas, otherwise a menu (Trade, Party, Whisper...).
    for (const r of this.world.remotes.values()) {
      if (Math.abs(wp.x - r.x) < 16 && wp.y < r.y + 6 && wp.y > r.y - (r.emperium ? 70 : 52)) {
        if (['proving_grounds', 'castle_veyl'].includes(this.world.map.def.id)) this.world.attackRemote(r.id);
        else if (this.host.playerMenu) this.host.playerMenu(r.id, p.event as MouseEvent);
        else this.host.openSocial?.();
        return;
      }
    }
    const target = this.pick(wp.x, wp.y);
    switch (target.kind) {
      case 'monster': this.world.attack(target.id!); break;
      case 'npc': this.world.interactNpc(target.id!); break;
      case 'item': this.world.pickupCmd(target.id!); break;
      case 'object': this.world.interactObjectCmd(target.id!); break;
      default: {
        // Cell-based walking as in Ragnarok: the destination is the centre of the clicked cell.
        const tx = Math.floor(wp.x / TILE), ty = Math.floor(wp.y / TILE);
        this.world.moveTo(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
        this.moveTargetCell = { x: tx, y: ty, at: this.time.now };
      }
    }
  }

  // ---------------------------------------------------------------- frame
  update(_time: number, delta: number) {
    const w = this.world;
    if (!this.host.paused) w.update(delta);
    const events = w.drainEvents();
    let mapChanged = false;
    for (const e of events) {
      if (e.type === 'mapChanged') mapChanged = true;
      else this.handleEvent(e);
    }
    this.host.onWorldEvents(events);
    if (mapChanged && (w.map.def.id !== this.builtMapId || w.map !== this.builtMap)) { this.buildMap(); return; }
    this.syncPlayer(delta);
    this.syncMonsters();
    this.syncNpcs(delta);
    this.syncGround();
    this.syncTombstones();
    this.syncPet();
    this.syncHomun();
    this.syncRemotes();
    this.drawOverlays();
    this.updateChunks();
    this.drawCellCursor();
    this.host.onFrame();
  }

  private handleEvent(e: WorldEvent) {
    const w = this.world;
    const show = this.host.settings.showDamageNumbers;
    switch (e.type) {
      case 'damage': {
        if (!show) break;
        const tgt = e.targetId === 'player' ? w.player : e.targetId === 'homun' ? w.homunActor : e.targetId.startsWith('remote:') ? w.remotes.get(e.targetId.slice(7)) : w.monsters.get(e.targetId);
        if (!tgt) break;
        const y = tgt.y - (e.targetId === 'player' || e.targetId.startsWith('remote:') ? 64 : e.targetId === 'homun' ? 44 : ((tgt as MonsterActor).def?.art.h ?? 48)) - 4;
        if (e.miss) floatText(this, tgt.x, y, 'MISS', '#c8c8d8', 14);
        else if (e.kind === 'heal') floatText(this, tgt.x, y, `+${e.amount}`, '#6fe08a', 16);
        else if (e.kind === 'mp') floatText(this, tgt.x, y, `+${e.amount}`, '#7fb0ff', 14);
        else {
          const isPlayer = e.targetId === 'player' || e.targetId === 'homun';
          const col = isPlayer ? '#ff5a5a' : e.crit ? '#ffd34d' : e.kind === 'magic' ? '#c9a6ff' : e.kind === 'dot' ? '#a9e04a' : '#ffffff';
          floatText(this, tgt.x, y, e.crit ? `${e.amount}!` : `${e.amount}`, col, e.crit ? 24 : isPlayer ? 15 : 17);
          if (this.fxOn && !isPlayer && e.element && e.element !== 'neutral' && e.kind !== 'dot') playFx(this, ELEMENT_FX[e.element] ?? 'slash_small', tgt.x, tgt.y - 10);
        }
        break;
      }
      case 'fx': {
        if (!this.fxOn) break;
        // Effects that carry an offset are attached to their target and move with it.
        const actor = e.offsetY === undefined ? undefined : e.targetId === 'player' ? w.player : e.targetId ? w.monsters.get(e.targetId) : undefined;
        const ox = 0, oy = e.offsetY ?? 0;
        const follow = actor ? () => (e.targetId === 'player' || !(actor as MonsterActor).dead ? { x: actor.x + ox, y: actor.y + oy } : null) : undefined;
        playFx(this, e.fx, e.x, e.y, e.radius, { flipX: e.fx.startsWith('slash') && w.player.x > e.x, follow });
        break;
      }
      case 'projectile': if (this.fxOn) playProjectile(this, e.fx, e.fromX, e.fromY, e.toX, e.toY, e.durationMs, e.color); break;
      case 'sound': audio.play(e.key); break;
      case 'levelUp': if (this.fxOn) floatText(this, w.player.x, w.player.y - 90, e.kind === 'base' ? 'LEVEL UP!' : 'JOB LEVEL UP!', e.kind === 'base' ? '#ffd34d' : '#7fd6ff', 22); break;
      case 'death': {
        const v = this.monViews.get(e.id);
        if (v) v.deadAt = this.time.now;
        break;
      }
      case 'bossIntro': if (this.fxOn) this.cameras.main.flash(400, 80, 20, 80); audio.playMusic('boss_battle'); break;
      case 'bossDefeated': if (this.fxOn) this.cameras.main.flash(600, 255, 230, 160); this.time.delayedCall(3000, () => audio.playMusic(this.world.map.def.bgm)); break;
      case 'playerDied': if (this.fxOn) this.cameras.main.shake(300, 0.01); break;
      case 'jobChanged': this.ensurePlayerTexture(); break;
      case 'statsChanged': this.ensurePlayerTexture(); break;
      default: break;
    }
  }

  private mountView: { sprite: Phaser.GameObjects.Sprite; rig: Rig } | null = null;
  private syncPlayer(delta: number) {
    const p = this.world.player;
    // Riding: a war-drake (the Fire Drake body, tinted) under the rider, who sits 14 px higher.
    const riding = !!this.world.char.flags.mounted && this.world.canMount;
    if (riding && (!this.mountView || !this.mountView.sprite.active)) {
      const def = this.world.data.monsters.get('fire_drake')!;
      const rig = proceduralMonRig(ensureMonsterTexture(this, def));
      this.mountView = { sprite: this.track(this.add.sprite(p.x, p.y, rig.clips.idle.key, 0).setOrigin(rig.originX, rig.originY).setScale(0.85).setTint(0x9ab8ff)), rig };
    }
    if (!riding && this.mountView) { this.mountView.sprite.destroy(); this.mountView = null; }
    if (this.mountView) {
      const mv = this.mountView, clip = (p.moving ? mv.rig.clips.walk : undefined) ?? mv.rig.clips.idle;
      const f = clipFrame(clip, p.dir, this.clipStep(clip, 0));
      mv.sprite.setPosition(Math.round(p.x), Math.round(p.y) + 6).setDepth(p.y - 1).setTexture(clip.key, f.frame).setFlipX(f.flipX);
    }
    this.player.setPosition(Math.round(p.x), Math.round(p.y) - (riding ? 14 : 0)).setDepth(p.y);
    const clip = this.playerRig.clips[toCharAnim(p.anim)] ?? this.playerRig.clips.idle;
    const fr = clipFrame(clip, p.dir, this.clipStep(clip, p.animAt));
    this.player.setTexture(clip.key, fr.frame).setFlipX(fr.flipX);
    this.player.setAlpha(this.world.playerStealthed ? 0.45 : 1);
    const nameLabel = `${this.world.char.name}${titleOf(this.world.char) ? `\n« ${titleOf(this.world.char)} »` : ''}`;
    if (this.playerName.text !== nameLabel) this.playerName.setText(nameLabel);
    this.playerName.setPosition(Math.round(p.x), Math.round(p.y) + 6);
    if (p.moving) {
      this.stepTimer -= delta;
      if (this.stepTimer <= 0) { audio.play('footstep'); this.stepTimer = 330; }
    }
  }

  private clipStep(clip: Clip, animAt: number, now = this.world.time): number {
    const f = Math.floor(Math.max(0, now - animAt) / clip.frameMs);
    return clip.loop ? f % clip.count : Math.min(clip.count - 1, f);
  }

  private syncMonsters() {
    const w = this.world;
    for (const [id, m] of w.monsters) {
      let v = this.monViews.get(id);
      if (!v) {
        const rig = proceduralMonRig(ensureMonsterTexture(this, m.def));
        const sprite = this.track(this.add.sprite(m.x, m.y, rig.clips.idle.key, 0).setOrigin(rig.originX, rig.originY));
        if (m.boss) sprite.setScale(1.15);
        const name = this.track(this.add.text(m.x, m.y + 4, `${m.def.name}  Lv.${m.def.level}`, labelStyle(m.boss ? '#ff8a7a' : '#ffffff')).setOrigin(0.5, 0).setDepth(1e5 + 2).setResolution(2));
        v = { sprite, name, deadAt: 0, rig };
        this.monViews.set(id, v);
      }
      const s = v.sprite;
      if (m.dead) {
        const since = this.time.now - (v.deadAt || this.time.now);
        const fr = clipFrame(v.rig.clips.death, m.dir, this.clipStep(v.rig.clips.death, 0, since));
        s.setTexture(v.rig.clips.death.key, fr.frame).setFlipX(fr.flipX);
        s.setAlpha(Math.max(0, 1 - since / 1400));
        v.name.setVisible(false);
        s.setVisible(since < 1400);
        continue;
      }
      if (!s.visible || s.alpha < 1) { s.setVisible(true).setAlpha(1); }
      s.setPosition(Math.round(m.x), Math.round(m.y) + (v.rig.originY < 1 ? 1 : 3)).setDepth(m.y);
      const clip = v.rig.clips[toMonAnim(m.anim)] ?? v.rig.clips.idle;
      const fr = clipFrame(clip, m.dir, this.clipStep(clip, m.animAt));
      s.setTexture(clip.key, fr.frame).setFlipX(fr.flipX);
      const frozen = m.statuses.some((st) => st.id === 'freeze');
      const tint = frozen ? 0x9ad8ff : m.statuses.some((st) => st.id === 'poison') ? 0xb8ff9a : m.statuses.some((st) => st.id === 'burn') ? 0xffb08a : m.boss?.enraged ? 0xff8a8a : 0xffffff;
      s.setTint(tint);
      const target = w.currentTarget?.id === id;
      const hover = this.hovered.kind === 'monster' && this.hovered.id === id;
      v.name.setVisible(target || hover || !!m.boss).setPosition(Math.round(m.x), Math.round(m.y) + 6);
      v.name.setColor(target ? '#ffd34d' : m.boss ? '#ff8a7a' : '#ffffff');
    }
    for (const [id, v] of this.monViews) {
      if (!w.monsters.has(id)) { v.sprite.destroy(); v.name.destroy(); this.monViews.delete(id); }
    }
  }

  /** The Alchemist's homunculus: its borrowed monster body, name and a small HP bar. */
  private syncHomun() {
    const w = this.world, h = w.char.homunculus, a = w.homunActor;
    const key = h ? `${h.typeId}:${h.evolved}` : '';
    if (this.homView && (!h || !a || this.homView.key !== key || !this.homView.sprite.active)) {
      this.homView.sprite.destroy(); this.homView.name.destroy(); this.homView.bar.destroy(); this.homView = null;
    }
    if (!h || !a) return;
    const def = w.data.monsters.get(w.data.homunculi.get(h.typeId)?.art ?? '');
    if (!def) return;
    if (!this.homView) {
      const rig = proceduralMonRig(ensureMonsterTexture(this, def));
      const sprite = this.track(this.add.sprite(a.x, a.y, rig.clips.idle.key, 0).setOrigin(rig.originX, rig.originY).setScale(h.evolved ? 1 : 0.8).setTint(0xe8d8ff));
      const name = this.track(this.add.text(a.x, a.y, '', labelStyle('#d8c8ff')).setOrigin(0.5, 1).setDepth(1e5 + 2).setResolution(2));
      const bar = this.track(this.add.graphics().setDepth(1e5 + 1));
      this.homView = { key, sprite, name, rig, bar };
    }
    const v = this.homView;
    v.sprite.setPosition(Math.round(a.x), Math.round(a.y) + 2).setDepth(a.y);
    const clip = (a.anim === 'attack' && w.time - a.animAt < 400 ? v.rig.clips.attack : a.moving ? v.rig.clips.walk : undefined) ?? v.rig.clips.idle;
    const fr = clipFrame(clip, a.dir, this.clipStep(clip, a.anim === 'attack' ? a.animAt : 0));
    v.sprite.setTexture(clip.key, fr.frame).setFlipX(fr.flipX);
    const top = Math.round(a.y) - 34;
    v.name.setText(`${h.name} Lv ${h.level}`).setPosition(Math.round(a.x), top);
    const max = homunStats(w.data, h).maxHp;
    v.bar.clear().fillStyle(0x1c1622, 1).fillRect(a.x - 16, a.y + 4, 32, 4).fillStyle(0x9a7aff, 1).fillRect(a.x - 16, a.y + 4, Math.round(32 * (h.hp / max)), 4);
  }

  /** The player's pet: the monster's own sprite at 70% scale, trailing the player. */
  private syncPet() {
    const w = this.world, pet = w.char.pet, a = w.petActor;
    if (this.petView && (!pet || !a || this.petView.petId !== pet.petId || !this.petView.sprite.active)) {
      this.petView.sprite.destroy(); this.petView.name.destroy(); this.petView.heart.destroy(); this.petView = null;
    }
    if (!pet || !a) return;
    const def = w.data.monsters.get(w.data.pets.get(pet.petId)?.monsterId ?? '');
    if (!def) return;
    if (!this.petView) {
      const rig = proceduralMonRig(ensureMonsterTexture(this, def));
      const sprite = this.track(this.add.sprite(a.x, a.y, rig.clips.idle.key, 0).setOrigin(rig.originX, rig.originY).setScale(0.7));
      const name = this.track(this.add.text(a.x, a.y + 4, '', labelStyle('#ffd8f0')).setOrigin(0.5, 0).setDepth(1e5 + 2).setResolution(2));
      const heart = this.track(this.add.text(a.x, a.y - 30, '♥', { fontFamily: 'Verdana', fontSize: '12px', color: '#ff7aa8', stroke: '#1c1622', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(1e5 + 2).setResolution(2));
      this.petView = { petId: pet.petId, sprite, name, rig, heart };
    }
    const v = this.petView;
    v.sprite.setPosition(Math.round(a.x), Math.round(a.y) + 2).setDepth(a.y);
    const clip = (a.moving ? v.rig.clips.walk : undefined) ?? v.rig.clips.idle;
    const fr = clipFrame(clip, a.dir, this.clipStep(clip, 0));
    v.sprite.setTexture(clip.key, fr.frame).setFlipX(fr.flipX);
    // Name above the pet so it never covers the player's name below the player.
    const top = Math.round(a.y) - 26;
    v.name.setText(pet.name).setOrigin(0.5, 1).setPosition(Math.round(a.x), top);
    // A heart floats over a Loyal pet; a sweat drop over a hungry one.
    const loyal = pet.intimacy >= 910, hungry = pet.hunger <= 25;
    v.heart.setText(hungry ? '…' : '♥').setColor(hungry ? '#9ad8ff' : '#ff7aa8').setVisible(loyal || hungry).setPosition(Math.round(a.x), top - 14);
  }

  /** MVP tombstones: where a boss fell, who was MVP, and a countdown to its return. */
  private syncTombstones() {
    const w = this.world;
    for (const [id, t] of Object.entries(w.tombstones)) {
      const live = t.mapId === w.map.def.id && t.respawnAt > w.time;
      let v = this.tombViews.get(id);
      if (!live) { if (v) { v.img.destroy(); v.label.destroy(); this.tombViews.delete(id); } continue; }
      if (!v) {
        const img = this.track(this.add.image(t.x, t.y + 4, ensureTombstoneTexture(this, w.data, w.map.def.tileset)).setOrigin(0.5, 1).setDepth(t.y));
        const label = this.track(this.add.text(t.x, t.y - 40, '', { fontFamily: 'Verdana', fontSize: '10px', color: '#ffe9a8', stroke: '#1c1622', strokeThickness: 3, align: 'center' }).setOrigin(0.5, 1).setDepth(1e5 + 2).setResolution(2));
        v = { img, label };
        this.tombViews.set(id, v);
      }
      const left = Math.max(0, Math.ceil((t.respawnAt - w.time) / 1000));
      const when = new Date(t.killedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      v.label.setText(`☠ ${t.boss}\nMVP: ${t.killer} · ${when}\nReturns in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    }
    for (const [id, v] of this.tombViews) if (!w.tombstones[id]) { v.img.destroy(); v.label.destroy(); this.tombViews.delete(id); }
  }

  private syncNpcs(delta: number) {
    this.markerTimer -= delta;
    const refreshMarkers = this.markerTimer <= 0;
    if (refreshMarkers) this.markerTimer = 400;
    for (const n of this.world.npcs) {
      const v = this.npcViews.get(n.npcId);
      if (!v) continue;
      v.sprite.setFrame(frameIndex(n.dir, 'idle', Math.floor(this.time.now / 520) % 2));
      if (refreshMarkers) {
        const mk = npcQuestMarker(this.world.data, this.world.char, n.npcId, this.world.now());
        v.marker.setText(mk === '…' ? '' : mk ?? '').setColor(mk === '?' ? '#7fffa0' : '#ffd34d');
      }
    }
  }

  private syncGround() {
    const w = this.world;
    for (const [id, g] of w.groundItems) {
      if (this.groundViews.has(id)) continue;
      const def = w.data.items.get(g.itemId)!;
      if (def.rarity !== 'common' && this.fxOn) {
        const glowColor = { uncommon: 0x6fe08a, rare: 0x7fb0ff, epic: 0xc9a6ff, legendary: 0xffd34d }[def.rarity] ?? 0xffffff;
        const glow = this.track(this.add.image(g.x, g.y, 'fx_glow').setTint(glowColor).setScale(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(g.y - 21));
        this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 1 }, yoyo: true, repeat: -1, duration: 600 });
        this.time.delayedCall(100, () => { if (!w.groundItems.has(id)) glow.destroy(); });
        this.groundGlows.set(id, glow);
      }
      const img = this.track(this.add.image(g.x, g.y, ensureItemTexture(this, def)).setScale(0.75).setDepth(g.y - 20));
      if (this.fxOn) this.tweens.add({ targets: img, y: g.y - 4, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
      this.groundViews.set(id, img);
    }
    for (const [id, img] of this.groundViews) {
      if (w.groundItems.has(id)) continue;
      img.destroy();
      this.groundViews.delete(id);
      this.groundGlows.get(id)?.destroy();
      this.groundGlows.delete(id);
    }
  }

  private drawOverlays() {
    const w = this.world, g = this.gfx, b = this.bars;
    g.clear(); b.clear();
    const now = w.time;
    // Ground zones (Fire Wall, Wind Trap...)
    for (const z of w.zones) {
      const col = z.effect.element === 'fire' ? 0xff6a2e : z.effect.element === 'wind' ? 0x7ad0e0 : 0x9a7aff;
      const pulse = 0.25 + 0.1 * Math.sin(now / 120);
      g.fillStyle(col, pulse); g.fillCircle(z.x, z.y, z.radius);
      g.lineStyle(2, col, 0.8); g.strokeCircle(z.x, z.y, z.radius);
      if (this.fxOn && !this.zoneEmitters.has(z.id)) {
        const em = this.track(this.add.particles(z.x, z.y, 'fx_dot', {
          speed: { min: 10, max: 40 }, angle: { min: 250, max: 290 }, lifespan: 600, scale: { start: 0.6, end: 0 }, tint: [col, 0xffffff],
          blendMode: Phaser.BlendModes.ADD, frequency: 60, gravityY: -60,
          emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, z.radius) } as never,
        }).setDepth(z.y + 10));
        this.zoneEmitters.set(z.id, em);
      }
    }
    for (const [id, em] of this.zoneEmitters) if (!w.zones.some((z) => z.id === id)) { em.destroy(); this.zoneEmitters.delete(id); }

    // Boss telegraphs: danger area + fill showing time until impact.
    for (const t of w.telegraphs) {
      const p = Phaser.Math.Clamp((now - t.startsAt) / (t.endsAt - t.startsAt), 0, 1);
      const a = t.endsAt < now ? 0.5 : 0.22;
      if (t.shape === 'circle') {
        g.fillStyle(0xff2a1a, a); g.fillCircle(t.x, t.y, t.radius);
        g.fillStyle(0xff2a1a, 0.35); g.fillCircle(t.x, t.y, t.radius * p);
        g.lineStyle(2, 0xff5a3a, 0.9); g.strokeCircle(t.x, t.y, t.radius);
      } else if (t.shape === 'ring') {
        const inner = t.innerRadius ?? 0;
        g.lineStyle(t.radius - inner, 0xff2a1a, a + 0.1 * p);
        g.strokeCircle(t.x, t.y, (t.radius + inner) / 2);
        g.lineStyle(2, 0xff5a3a, 0.9); g.strokeCircle(t.x, t.y, t.radius); g.strokeCircle(t.x, t.y, inner);
      } else if (t.shape === 'line') {
        const ang = Math.atan2(t.y2! - t.y, t.x2! - t.x), half = (t.width ?? 60) / 2;
        const nx = -Math.sin(ang) * half, ny = Math.cos(ang) * half;
        const pts = [new Phaser.Math.Vector2(t.x + nx, t.y + ny), new Phaser.Math.Vector2(t.x2! + nx, t.y2! + ny), new Phaser.Math.Vector2(t.x2! - nx, t.y2! - ny), new Phaser.Math.Vector2(t.x - nx, t.y - ny)];
        g.fillStyle(0xff2a1a, a + 0.15 * p); g.fillPoints(pts, true);
        g.lineStyle(2, 0xff5a3a, 0.9); g.strokePoints(pts, true);
      }
    }

    // Casting circle under the player.
    const p = w.player;
    if (p.cast) {
      const prog = (now - p.cast.startedAt) / (p.cast.endsAt - p.cast.startedAt);
      g.lineStyle(2, 0x9a7aff, 0.9); g.strokeEllipse(p.x, p.y, 56, 22);
      g.lineStyle(2, 0xd8c8ff, 0.9);
      g.beginPath(); g.arc(p.x, p.y, 20, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.strokePath();
    }
    // Target ring under the current target.
    const tgt = w.currentTarget;
    if (tgt && !tgt.dead) { g.lineStyle(2, 0xffd34d, 0.9); g.strokeEllipse(tgt.x, tgt.y + 2, tgt.halfW * 3 + 10, tgt.halfW + 8); }

    // HP bars: player (+MP) and damaged / targeted monsters.
    const bar = (x: number, y: number, wdt: number, pct: number, col: number) => {
      b.fillStyle(0x1c1622, 0.85); b.fillRect(x - wdt / 2 - 1, y - 1, wdt + 2, 5);
      b.fillStyle(col, 1); b.fillRect(x - wdt / 2, y, Math.max(0, wdt * pct), 3);
    };
    if (!p.dead) {
      bar(p.x, p.y + 20, 36, w.char.hp / w.stats.maxHp, 0x5ad86a);
      bar(p.x, p.y + 25, 36, w.char.mp / w.stats.maxMp, 0x5a9aff);
    }
    for (const m of w.monsters.values()) {
      if (m.dead || m.boss) continue;
      if (m.hp < m.maxHp || tgt === m) bar(m.x, m.y + 18, 32, m.hp / m.maxHp, 0xe04a3a);
    }
  }
}

function labelStyle(color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: '11px', color, stroke: '#1c1622', strokeThickness: 3 };
}

function toCharAnim(a: AnimState): CharAnim {
  return a === 'dead' ? 'death' : a;
}
function toMonAnim(a: AnimState): MonAnim {
  return a === 'dead' ? 'death' : a === 'cast' ? 'attack' : a;
}
export function frameIndex(dir: Direction, anim: CharAnim, f: number): number {
  return CHAR_DIRECTIONS.indexOf(dir) * CHAR_SHEET_COLS + CHAR_ANIMS[anim].start + f;
}

const procClips = <A extends string>(key: string, anims: Record<A, { start: number; count: number; frameMs: number; loop: boolean }>, cols: number, rows: number) =>
  Object.fromEntries(Object.entries(anims).map(([name, a]) => {
    const m = a as { start: number; count: number; frameMs: number; loop: boolean };
    return [name, { key, cols, rows, directions: CHAR_DIRECTIONS, ...m }];
  })) as Record<string, Clip>;
function proceduralCharRig(key: string): Rig {
  return { clips: procClips(key, CHAR_ANIMS, CHAR_SHEET_COLS, CHAR_DIRECTIONS.length), originX: CHAR_PIVOT.x, originY: CHAR_PIVOT.y };
}
function proceduralMonRig(key: string): Rig {
  return { clips: procClips(key, MON_ANIMS, MON_SHEET_COLS, 1), originX: 0.5, originY: 1 };
}

/** Four L-shaped corners around one map cell, with a dark under-stroke so they read on any ground. */
function cornerBrackets(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, alpha: number) {
  const L = 9, i = 2, s = TILE - 2 * i;
  const corners: [number, number, number, number][] = [[x + i, y + i, 1, 1], [x + i + s, y + i, -1, 1], [x + i, y + i + s, 1, -1], [x + i + s, y + i + s, -1, -1]];
  for (const [w, c, a] of [[4, 0x0c2a20, alpha * 0.45], [2, color, alpha]] as const) {
    g.lineStyle(w, c, a);
    for (const [cx, cy, dx, dy] of corners) {
      g.beginPath(); g.moveTo(cx + dx * L, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + dy * L); g.strokePath();
    }
  }
}
