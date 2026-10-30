// Application shell: screen flow, save management, input mapping, and the
// bridge between the Phaser scenes (GameHost) and the HTML UI.
import { Online } from './online';
import Phaser from 'phaser';
import { loadGameData, type GameData } from '../core/data';
import { createCharacter } from '../core/character';
import { DEFAULT_KEYBINDS, loadSave, newSaveFile, SAVE_KEY, writeSave } from '../core/save';
import type { Appearance, HotbarSlot, SaveFile, Settings } from '../core/types';
import { World, type WorldEvent } from '../core/world';
import { runGmCommand } from '../core/gm';
import { keyFromEvent } from './keys';
import { setLang, type Lang } from './i18n';
import { audio } from '../game/audio/audio';
import type { GameHost } from '../game/host';
import { BootScene } from '../game/scenes/BootScene';
import { GameScene } from '../game/scenes/GameScene';
import { MenuScene } from '../game/scenes/MenuScene';
import { h, setChildren } from './dom';
import { Hud } from './hud';
import { characterCreateScreen, characterSelectScreen, titleScreen } from './screens';
import { WindowManager, type WindowId } from './windows';
import { achievementDef, dailyStatus } from '../core/achievements';
import { bindPinchZoom, isTouchDevice, TouchControls } from './touch';

export const ZOOM_MIN = 0.75, ZOOM_MAX = 2.5;

const WINDOW_ACTIONS: Record<string, WindowId> = {
  inventory: 'inventory', equipment: 'equipment', status: 'status', skills: 'skills', quests: 'quests', worldMap: 'worldMap', settings: 'settings', database: 'database', social: 'social', auto: 'auto', pet: 'pet', homun: 'homun', cart: 'cart', runes: 'runes',
};

export class App implements GameHost {
  data: GameData;
  save: SaveFile;
  world!: World;
  slot = -1;
  paused = false;
  pointerWorld: { x: number; y: number } | null = null;
  game!: Phaser.Game;
  hud: Hud | null = null;
  windows!: WindowManager;
  uiScale = 1;
  private screenEl: HTMLElement | null = null;
  private uiRoot: HTMLElement;
  private held = new Set<string>();
  private windowsDirty = false;
  private lastWindowRefresh = 0;
  private lastAutosave = 0;
  private storageOk = true;
  /** Online play (optional; the game is single-player until you log in to a server). */
  online!: Online;

  constructor() {
    this.data = loadGameData();
    this.uiRoot = document.getElementById('ui')!;
    this.save = this.loadOrRecover();
    this.windows = new WindowManager(this, this.uiRoot);
    this.online = new Online(this);
    audio.setVolumes(this.settings.volume);
    setLang(this.settings.language ?? 'en');
    this.fitToWindow();
    window.addEventListener('resize', () => this.fitToWindow());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => { this.held.clear(); this.updateMoveDir(); });
    window.addEventListener('beforeunload', () => { if (this.world) this.saveNow(false); });
    (window as unknown as { __veyloria: App }).__veyloria = this; // debug/testing hook
  }

  get settings(): Settings { return this.save.settings; }

  // ---------------------------------------------------------------- boot
  start() {
    const loading = h('div', { class: 'loading', id: 'loading' }, h('div', { class: 'logo', style: 'font-size:40px' }, 'VEYLORIA ONLINE'),
      h('div', { class: 'bar' }, h('div', { class: 'fill' })), h('div', { class: 'muted' }, 'Loading Veyloria…'));
    this.uiRoot.appendChild(loading);
    window.addEventListener('veyloria:loading', (e) => {
      const p = (e as CustomEvent<number>).detail;
      (loading.querySelector('.fill') as HTMLElement).style.width = `${p * 100}%`;
      if (p >= 1) setTimeout(() => { loading.remove(); this.showTitle(); }, 150);
    });
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: 1280,
      height: 720,
      backgroundColor: '#0c0a12',
      pixelArt: true,
      roundPixels: true,
      scene: [BootScene, MenuScene, GameScene],
      fps: { target: 60 },
      audio: { noAudio: true },
    });
    bindPinchZoom(document.getElementById('game')!, this);
  }

  private loadOrRecover(): SaveFile {
    try {
      return loadSave(window.localStorage, this.data);
    } catch (err) {
      console.error('Save load failed', err);
      let backup: SaveFile | null = null;
      try {
        const raw = window.localStorage.getItem(`${SAVE_KEY}.backup`);
        if (raw) { window.localStorage.setItem(SAVE_KEY, raw); backup = loadSave(window.localStorage, this.data); }
      } catch { backup = null; }
      setTimeout(() => this.windows.showModal('Save data problem',
        backup ? 'Your save file was damaged, so the most recent backup was restored.' : 'Your save file could not be read and no backup was available. A new save was started.',
        [['OK', () => undefined]], true), 500);
      if (!backup) this.storageOk = this.testStorage();
      return backup ?? newSaveFile();
    }
  }

  private testStorage(): boolean {
    try { localStorage.setItem('veyloria.test', '1'); localStorage.removeItem('veyloria.test'); return true; } catch { return false; }
  }

  private fitToWindow() {
    const frame = document.getElementById('frame')!;
    this.uiScale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    frame.style.transform = `scale(${this.uiScale})`;
    this.game?.scale.refresh();
  }

  // ---------------------------------------------------------------- screens
  private setScreen(el: HTMLElement | null) {
    this.screenEl?.remove();
    this.screenEl = el;
    if (el) this.uiRoot.appendChild(el);
  }

  /** Switch the interface language (English / Thai) and remember it. */
  setLanguage(lang: Lang) {
    this.settings.language = lang;
    setLang(lang);
    this.persist();
    this.windows.refresh();
  }

  showTitle() {
    audio.playMusic('title');
    this.setScreen(titleScreen(() => this.showSelect(), () => this.windows.open('settings'), (l) => this.setLanguage(l)));
  }

  showSelect() {
    this.setScreen(characterSelectScreen(this.data, this.save, {
      onPlay: (slot) => this.enterWorld(slot),
      onCreate: (slot) => this.showCreate(slot),
      onDelete: (slot, name) => this.windows.confirmTyped('Delete character', `Delete ${name}? This cannot be undone. Type the character's name to confirm.`, name, 'Delete forever', () => {
        this.save.characters[slot] = null;
        this.persist();
        this.showSelect();
      }),
      onBack: () => this.showTitle(),
    }));
  }

  showCreate(slot: number) {
    this.setScreen(characterCreateScreen((name: string, ap: Appearance) => {
      if (this.save.characters.some((c) => c && c.name.toLowerCase() === name.toLowerCase())) return 'You already have a character with that name.';
      const c = createCharacter(this.data, name, ap);
      this.save.characters[slot] = c;
      this.persist();
      this.enterWorld(slot);
      return null;
    }, () => this.showSelect()));
  }

  enterWorld(slot: number) {
    const c = this.save.characters[slot];
    if (!c) return;
    audio.unlock();
    this.slot = slot;
    this.world = new World(this.data, c, { autoLoot: this.settings.autoLoot });
    this.setScreen(null);
    this.hud?.root.remove();
    this.hud = new Hud(this);
    this.uiRoot.insertBefore(this.hud.root, this.uiRoot.firstChild);
    this.hud.resetMinimap();
    this.game.scene.stop('Menu');
    this.game.scene.start('Game', { host: this });
    this.hud.banner(this.world.map.def.name, `Welcome, ${c.name}`);
    this.hud.log(`Welcome to Veyloria, ${c.name}! Click to move, click monsters to attack. Talk to NPCs marked with ! for quests.`, 'system');
    this.hud.log('Keys: I inventory · E equipment · C status · K skills · Q quests · M map · O settings · 1-0 hotbar · Tab target · Z loot · F talk', 'system');
    this.lastAutosave = performance.now();
    this.applyTouch();
    if (dailyStatus(c, this.world.now()).canClaim) this.windows.open('daily');
    this.online.join();
  }

  markWindowsDirty() { this.windowsDirty = true; }
  openSocial() { this.windows.open('social'); }
  playerMenu(name: string, e: MouseEvent) {
    const on = this.online, info = on.players.get(name);
    const items: [string, () => void][] = [
      ['Trade', () => { on.tradeRequest(name); this.windows.open('social'); }],
      ['Invite to party', () => on.partyInvite(name)],
    ];
    if (on.guild) items.push(['Invite to guild', () => on.guildInvite(name)]);
    items.push(['Whisper', () => this.hud?.startWhisper(name)]);
    if (info?.vending) items.push([`View shop: ${info.vending}`, () => { on.viewShop(name); this.windows.open('social'); }]);
    // Next tick: the same mouse press would otherwise close the menu straight away.
    setTimeout(() => this.windows.openContextAt(e, items, `${name}${info ? ` · Lv ${info.level}` : ''}`), 0);
  }

  exitToSelect() {
    this.saveNow(false);
    this.windows.closeAll();
    this.windows.closeModal();
    this.game.scene.stop('Game');
    this.game.scene.start('Menu');
    this.hud?.root.remove();
    this.hud = null;
    this.slot = -1;
    this.showSelect();
  }

  // ---------------------------------------------------------------- saving
  persist(): boolean {
    try {
      writeSave(window.localStorage, this.save);
      return true;
    } catch (err) {
      console.error('Save failed', err);
      this.hud?.toast('Could not save — browser storage is unavailable or full.', true);
      return false;
    }
  }

  saveNow(manual: boolean) {
    if (!this.world || this.slot < 0) return;
    this.save.characters[this.slot] = this.world.char;
    if (this.persist() && manual) this.hud?.toast('Game saved.');
    this.lastAutosave = performance.now();
  }

  applySettings() {
    audio.setVolumes(this.settings.volume);
    if (this.world) this.world.autoLoot = this.settings.autoLoot;
    const scene = this.game.scene.getScene('Game') as GameScene | null;
    if (scene && scene.scene.isActive()) { scene.setCollisionVisible(this.settings.showCollision); scene.setGridVisible(!!this.settings.showGrid); }
    this.hud?.buildHotbar();
    this.applyTouch();
    this.persist();
  }

  /** Touch controls: on for touch screens unless turned off in the settings. */
  touch: TouchControls | null = null;
  applyTouch() {
    const on = this.settings.touchControls ?? isTouchDevice();
    if (!this.world || !this.hud) return;
    if (on && !this.touch) { this.touch = new TouchControls(this); }
    if (this.touch) {
      if (on && !this.touch.root.parentElement) this.hud.root.appendChild(this.touch.root);
      if (!on) this.touch.root.remove();
    }
  }

  // ---------------------------------------------------------------- GameHost
  onWorldEvents(events: WorldEvent[]) {
    const hud = this.hud;
    if (!hud) return;
    for (const e of events) {
      switch (e.type) {
        case 'message':
          hud.log(e.text, e.channel);
          if (e.channel === 'error') hud.toast(e.text, true);
          break;
        case 'npcInteract': if (this.world.auto.mode !== 'quest') this.windows.openNpcDialog(e.npcId); break;
        case 'objectInteract': this.windows.showObjectText(e.name, e.text); break;
        case 'openWindow': this.windows.open(e.id); break;
        case 'achievement': { const a = achievementDef(e.id); if (a) hud.banner('Achievement unlocked!', `${a.name} — title «${a.title}»`); this.windowsDirty = true; break; }
        case 'levelUp': hud.banner(e.kind === 'base' ? `Level ${e.level}!` : `Job Level ${e.level}!`, e.kind === 'base' ? 'Stat points gained — open Status (C)' : 'Skill point gained — open Skills (K)'); this.windowsDirty = true; break;
        case 'bossIntro': hud.banner(e.name, e.title, 'boss'); hud.log(e.text, 'combat'); break;
        case 'bossPhase': hud.banner(e.name, e.text, 'boss'); break;
        case 'bossEnrage': hud.banner(`${e.name} is ENRAGED!`, 'Its attacks grow faster and stronger', 'boss'); break;
        case 'bossDefeated': hud.banner('VICTORY', `${e.name} has fallen!`); break;
        case 'mvp': hud.banner('MVP!', `${e.killer} is the MVP of ${e.name} · +${e.exp} EXP${e.items.length ? ` · ${e.items.map((i) => this.world!.data.items.get(i)?.name).join(', ')}` : ''}`); break;
        case 'mapChanged':
          hud.resetMinimap();
          hud.banner(this.world.map.def.name, this.world.map.def.levelRange ? `Lv.${this.world.map.def.levelRange.join('–')}` : this.world.map.def.region);
          this.windows.closeDialog();
          this.saveNow(false);
          break;
        case 'playerDied':
          this.windows.closeDialog();
          setTimeout(() => this.windows.showModal('You have been defeated',
            `You will return to your save point (${this.data.maps.get(this.world.char.savePoint.mapId)?.name}) with half HP.`,
            [['Return to save point', () => this.world.respawn()]]), 1200);
          break;
        case 'jobChanged': hud.buildHotbar(); this.windowsDirty = true; break;
        case 'questUpdate': case 'statsChanged': case 'loot': this.windowsDirty = true; break;
        default: break;
      }
    }
  }

  onFrame() {
    this.hud?.update();
    const now = performance.now();
    if (this.windowsDirty && now - this.lastWindowRefresh > 200) {
      this.windowsDirty = false;
      this.lastWindowRefresh = now;
      this.windows.refresh();
    }
    if (now - this.lastAutosave > this.data.balance.save.autosaveIntervalMs) this.saveNow(false);
  }

  // ---------------------------------------------------------------- hotbar & chat
  keyLabel(action: string): string {
    const k = this.settings.keybinds[action] ?? DEFAULT_KEYBINDS[action] ?? '';
    if (k.startsWith('shift+')) return `⇧${k.slice(6).toUpperCase()}`;
    return k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k;
  }

  /** Camera zoom, saved with the settings (mouse wheel, minimap buttons, + / − keys). */
  setZoom(z: number) {
    this.settings.zoom = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 100) / 100;
    const scene = this.game.scene.getScene('Game') as GameScene | null;
    if (scene && scene.scene.isActive()) scene.applyZoom(this.settings.zoom);
    this.hud?.showZoom(this.settings.zoom);
    this.persistSoon();
  }
  zoomBy(steps: number) { this.setZoom((this.settings.zoom ?? 1.5) + steps * 0.25); }
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistSoon() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => { this.persistTimer = null; this.persist(); }, 500);
  }

  assignHotbar(i: number, slot: HotbarSlot) {
    if (!this.world) return;
    const bar = this.world.char.hotbar;
    if (i < 0) i = bar.findIndex((s) => !s);
    if (i < 0) { this.hud?.toast('Hotbar is full — drag onto a slot to replace it.', true); return; }
    for (let k = 0; k < bar.length; k++) if (bar[k]?.type === slot.type && bar[k]?.id === slot.id) bar[k] = null;
    bar[i] = slot;
    this.hud?.buildHotbar();
  }

  useHotbar(i: number) {
    const w = this.world;
    if (!w) return;
    const s = w.char.hotbar[i];
    if (!s) return;
    if (s.type === 'item') { w.useItemById(s.id); return; }
    const sk = this.data.skills.get(s.id);
    if (!sk) return;
    const target = w.currentTarget;
    if (sk.targeting === 'ground') {
      if (target && !target.dead) w.castSkill(sk.id, { targetId: target.id });
      else if (this.pointerWorld) w.castSkill(sk.id, { x: this.pointerWorld.x, y: this.pointerWorld.y });
      else w.castSkill(sk.id);
    } else if (sk.targeting === 'enemy') {
      const t = target && !target.dead ? target : w.targetNearestMonster();
      if (t) w.castSkill(sk.id, { targetId: t.id }); else w.castSkill(sk.id);
    } else w.castSkill(sk.id);
  }

  /** RO-style GM text commands (@help). @announce/@kick/@woe/@castle/@emperium/@players go to the server. */
  gmCommand(line: string) {
    const [cmd, ...args] = line.trim().split(/\s+/);
    const server = ['@announce', '@kick', '@woe', '@castle', '@emperium', '@players'];
    if (cmd === '@token') { this.gmToken = args[0] ?? ''; this.hud?.log('Server admin token set for this session.', 'system'); return; }
    if (server.includes(cmd.toLowerCase())) {
      if (!this.online.serverGm(this.gmToken, cmd.slice(1).toLowerCase(), args)) this.hud?.log('Server GM commands need you to be online (Social window, G). Set the token with @token <admin token>.', 'error');
      return;
    }
    const r = runGmCommand(this.world, line);
    for (const l of ((r.ok ? r.message : r.error) ?? '').split('\n')) this.hud?.log(l, r.ok ? 'system' : 'error');
    if (line.trim().toLowerCase() === '@help') this.hud?.log('Server (online, needs @token): @announce text · @players · @kick name · @woe open|close|auto · @castle guild|none · @emperium', 'system');
    this.markWindowsDirty();
  }
  gmToken = '';

  chatCommand(cmd: string) {
    const w = this.world;
    const [name] = cmd.slice(1).split(/\s+/);
    switch (name) {
      case 'help': this.hud?.log('Commands: /where /save /stuck /played /gm /help · F8 opens GM tools · @help lists GM commands', 'system'); break;
      case 'gm': case 'admin': this.windows.toggle('admin'); break;
      case 'where': this.hud?.log(`${w.map.def.name} (${Math.floor(w.player.x / 32)}, ${Math.floor(w.player.y / 32)})`, 'system'); break;
      case 'save': this.saveNow(true); break;
      case 'played': this.hud?.log(`Played ${Math.floor(w.char.stats_meta.playTimeMs / 60000)} minutes.`, 'system'); break;
      case 'stuck': w.enterMap(w.map.def.id, 'default'); break;
      default: this.hud?.log(`Unknown command ${cmd}. Try /help`, 'error');
    }
  }

  // ---------------------------------------------------------------- input
  private actionForKey(key: string, e?: KeyboardEvent): string | null {
    if (e) key = keyFromEvent(e);
    const k = key.length === 1 ? key.toLowerCase() : key;
    for (const [action, bound] of Object.entries(this.settings.keybinds)) if (bound === k) return action;
    // Actions added after a save was made fall back to their default key.
    for (const [action, bound] of Object.entries(DEFAULT_KEYBINDS)) if (bound === k && !(action in this.settings.keybinds)) return action;
    return null;
  }

  private onKeyDown(e: KeyboardEvent) {
    if (this.windows.captureKey(e)) return;
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    audio.unlock();
    if (!this.world || !this.hud) {
      if (e.key === 'Escape') this.windows.closeTop();
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); this.hud.focusChat(); return; }
    if (e.key === 'Escape') { e.preventDefault(); if (!this.windows.closeTop()) this.windows.open('settings'); return; }
    if (e.key === 'Tab') { e.preventDefault(); this.world.targetNearestMonster(); return; }
    if (e.key === 'F8') { e.preventDefault(); this.windows.toggle('admin'); return; }
    if (this.windows.dialogOpen && /^[1-9]$/.test(e.key)) { if (this.windows.dialogKey(Number(e.key))) return; }
    const action = this.actionForKey(e.key, e);
    const moveKey = e.shiftKey ? null : this.moveDirKey(e.key);
    if (moveKey && this.settings.wasdMovement && (!action || ['up', 'down', 'left', 'right'].includes(action))) {
      this.held.add(moveKey);
      this.updateMoveDir();
      e.preventDefault();
      return;
    }
    if (!action || e.repeat) return;
    if (action.startsWith('hotbar')) { e.preventDefault(); this.useHotbar(Number(action.slice(6)) - 1); return; }
    if (action === 'zoomIn' || action === 'zoomOut') { this.zoomBy(action === 'zoomIn' ? 1 : -1); return; }
    if (WINDOW_ACTIONS[action]) { this.windows.toggle(WINDOW_ACTIONS[action]); return; }
    if (action === 'pickup') { this.world.pickupNearest(); return; }
    if (action === 'interact') { this.interactNearest(); return; }
  }

  private onKeyUp(e: KeyboardEvent) {
    const k = this.moveDirKey(e.key);
    if (k) { this.held.delete(k); this.updateMoveDir(); }
  }

  private moveDirKey(key: string): 'up' | 'down' | 'left' | 'right' | null {
    if (key === 'ArrowUp') return 'up';
    if (key === 'ArrowDown') return 'down';
    if (key === 'ArrowLeft') return 'left';
    if (key === 'ArrowRight') return 'right';
    const action = this.actionForKey(key);
    return action === 'up' || action === 'down' || action === 'left' || action === 'right' ? action : null;
  }

  private updateMoveDir() {
    if (!this.world) return;
    const dx = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    const dy = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
    if ((dx || dy) && this.world.auto.mode !== 'off') this.world.auto.stop('manual control');
    this.world.setMoveDir(dx, dy);
  }

  interactNearest() {
    const w = this.world;
    let best: string | null = null, bd = 220;
    for (const n of w.npcs) {
      const d = Math.hypot(n.x - w.player.x, n.y - w.player.y);
      if (d < bd) { bd = d; best = n.npcId; }
    }
    if (best) { w.interactNpc(best); return; }
    for (const o of w.map.def.objects) {
      const d = Math.hypot((o.x + 0.5) * 32 - w.player.x, (o.y + 0.5) * 32 - w.player.y);
      if (d < bd) { bd = d; best = o.id; }
    }
    if (best) w.interactObjectCmd(best);
  }

  showFatal(msg: string) {
    setChildren(this.uiRoot, h('div', { class: 'screen' }, h('div', { class: 'panel modal' }, h('h3', {}, 'Something went wrong'), h('p', {}, msg),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reload'))));
  }

  get storageAvailable() { return this.storageOk; }
}
