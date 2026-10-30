// In-game HUD (HTML overlay above the Phaser canvas).
import { expToNextBase, expToNextJob } from '../core/formulas';
import { countItem } from '../core/inventory';
import { activeQuests, objectiveTarget } from '../core/quests';
import { TILE } from '../core/mapCompiler';
import type { HotbarSlot } from '../core/types';
import { itemIconUrl, skillIconUrl } from '../game/art/icons';
import { portraitFromSheet, generateCharacterSheet } from '../game/art/characterSprite';
import { h, setChildren } from './dom';
import { HOTBAR_SLOTS } from '../core/save';
import type { App } from './app';
import { lookForCharacter } from './screens';

type Channel = 'system' | 'combat' | 'loot' | 'quest' | 'error' | 'chat';
const DRAG_MIME = 'application/x-veyloria';

export function setDragData(e: DragEvent, payload: { type: 'skill' | 'item' | 'inv' | 'equip'; id: string }) {
  e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer?.setData('text/plain', payload.id);
}
export function getDragData(e: DragEvent): { type: 'skill' | 'item' | 'inv' | 'equip'; id: string } | null {
  const raw = e.dataTransfer?.getData(DRAG_MIME);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export class Hud {
  root: HTMLElement;
  private portrait = h('canvas', { class: 'portrait', width: 96, height: 96 });
  private whoName = h('div', { class: 'who' });
  private whoClass = h('div', { class: 'cls' });
  private baseLvEl = h('span');
  private jobLvEl = h('span');
  private pointsEl = h('button', { class: 'pts', id: 'btn-points', onclick: () => this.app.windows.open('status') });
  /** Big AUTO (Auto Farm) toggle beside the hotbar, and the Auto Quest button in the quest tracker. */
  private autoBtn = h('button', { class: 'auto-btn', id: 'btn-auto-farm', title: 'Auto Farm: fights the monsters around you', onclick: () => this.toggleAutoFarm() });
  private autoQuestBtn = h('button', { class: 'btn small', id: 'btn-auto-quest', onclick: () => this.toggleAutoQuest() });
  private zoomSlider = h('input', { type: 'range', id: 'zoom-slider', min: 75, max: 250, step: 5 }) as HTMLInputElement;
  private menuEl: HTMLElement | null = null;
  private menuToggle = h('button', { class: 'menu-toggle', id: 'btn-menu-toggle', onclick: () => this.setMenuCollapsed(!this.app.settings.menuCollapsed) });
  /** Auto Farm / Auto Quest status. */
  private autoEl = h('div', { id: 'auto-status', style: 'position:absolute;bottom:150px;left:50%;transform:translateX(-50%);padding:3px 10px;background:#1c1622dd;border:1px solid #6fe08a;border-radius:6px;color:#b8ffc8;font-size:12px;display:none;z-index:5;pointer-events:auto;cursor:pointer' });
  /** Active raid (map and time left). */
  private clockEl = h('div', { id: 'world-clock', style: 'position:absolute;top:8px;right:222px;min-width:110px;text-align:center;padding:2px 6px;background:#1c1622cc;border:1px solid #5a4a3a;border-radius:5px;color:#e8dcc0;font-size:11px;z-index:5' });
  /** Memorial-dungeon timer (floor and time left). */
  private instTimer = h('div', { id: 'inst-timer', style: 'position:absolute;top:8px;left:50%;transform:translateX(-50%);padding:4px 12px;background:#1c1622dd;border:1px solid #c8a26b;border-radius:6px;color:#ffe9a8;font-size:13px;display:none;z-index:5' });
  private hpBar = bar('hp');
  private mpBar = bar('mp');
  private expBar = bar('exp');
  private jexpBar = bar('jexp');
  private buffsEl = h('div', { class: 'buffs passthrough' });
  private targetEl = h('div', { class: 'panel hud-target hidden passthrough' });
  private bossEl = h('div', { class: 'panel hud-boss hidden passthrough' });
  private miniCanvas = h('canvas', { width: 186, height: 140 });
  private miniBase: HTMLCanvasElement | null = null;
  private miniName = h('div', { class: 'mname' });
  private miniCoords = h('div', { class: 'coords' });
  private trackerEl = h('div', { class: 'panel tracker' });
  private chatLog = h('div', { class: 'log' });
  private chatInput = h('input', { placeholder: 'Press Enter to chat · /help for commands', maxlength: 120 });
  private chatFilter: Channel | 'all' = 'all';
  private hotbarEl = h('div', { class: 'panel hotbar' });
  private castEl = h('div', { class: 'panel castbar hidden passthrough' });
  private toastArea = h('div', { class: 'toast-area' });
  private lumaEl = h('span', { class: 'gold' });
  private zoomEl = h('span', { class: 'zval' });
  private lastSlow = 0;
  private lastPortraitKey = '';

  constructor(private app: App) {
    const chatTabs = h('div', { class: 'tabs' }, ...(['all', 'combat', 'loot', 'quest', 'system'] as const).map((c) =>
      h('span', { class: `tab${c === 'all' ? ' on' : ''}`, onclick: (e: Event) => {
        this.chatFilter = c;
        (e.target as HTMLElement).parentElement!.querySelectorAll('.tab').forEach((t) => t.classList.remove('on'));
        (e.target as HTMLElement).classList.add('on');
        this.applyChatFilter();
      } }, c)));
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { this.submitChat(); this.chatInput.blur(); }
      if (e.key === 'Escape') this.chatInput.blur();
    });
    this.miniCanvas.addEventListener('click', (e) => {
      const w = this.app.world; if (!w) return;
      const r = this.miniCanvas.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width, sy = (e.clientY - r.top) / r.height;
      w.moveTo(sx * w.map.width * TILE, sy * w.map.height * TILE);
    });
    // Icon menu (two rows), Ragnarok-style: icon + short label, hotkey in the tooltip.
    const MENU: [string, string, string, string?][] = [
      ['status', '📊', 'Status'], ['inventory', '🎒', 'Items'], ['equipment', '🛡️', 'Equip'], ['skills', '✨', 'Skills'], ['quests', '📜', 'Quests'], ['worldMap', '🗺️', 'Map'], ['social', '👥', 'Social'], ['settings', '⚙️', 'Menu'],
      ['pet', '🐾', 'Pet'], ['homun', '🧪', 'Homun'], ['cart', '🛒', 'Cart'], ['runes', '⭐', 'Runes'], ['database', '📖', 'DB'], ['achievements', '🏆', 'Titles'], ['daily', '🎁', 'Daily'], ['admin', '👑', 'GM', 'btn-gm'],
    ];
    const menu = h('div', { class: 'panel menu-grid', id: 'menu-grid' },
      ...MENU.map(([id, icon, label, elId]) => h('button', {
        class: 'mbtn', id: elId, dataset: { win: id },
        title: id === 'admin' ? 'GM / Admin tools (F8 or /gm)' : id === 'auto' ? `Auto Farm / Auto Quest (${this.app.keyLabel('auto')})` : `${label} (${this.app.keyLabel(id)})`,
        onclick: () => this.app.windows.toggle(id as never),
      }, h('span', { class: 'ico' }, icon), h('span', { class: 'lbl' }, label))));
    this.menuEl = menu;
    this.zoomSlider.addEventListener('input', () => this.app.setZoom(Number(this.zoomSlider.value) / 100));
    const zoomBox = h('div', { class: 'zoom-box' },
      h('button', { class: 'zbtn', id: 'zoom-out', title: 'Zoom out (−)', onclick: () => this.app.zoomBy(-1) }, '−'),
      this.zoomSlider,
      h('button', { class: 'zbtn', id: 'zoom-in', title: 'Zoom in (+)', onclick: () => this.app.zoomBy(1) }, '+'),
      this.zoomEl);
    const autoBox = h('div', { class: 'auto-box', id: 'auto-box' }, this.autoBtn,
      h('button', { class: 'auto-gear', id: 'btn-auto-settings', title: 'Auto settings', onclick: () => this.app.windows.toggle('auto') }, '⚙'));
    const statRow = (label: string, b: { el: HTMLElement }) => h('div', { class: 'srow' }, h('span', { class: 'sl' }, label), b.el);
    this.root = h('div', { id: 'hud', class: 'passthrough', style: 'position:absolute;inset:0' },
      h('div', { class: 'panel hud-status' },
        h('div', { class: 'head' }, this.portrait, h('div', {}, this.whoName, this.whoClass)),
        h('div', { class: 'lvs' }, this.baseLvEl, this.jobLvEl),
        statRow('HP', this.hpBar), statRow('MP', this.mpBar), statRow('Base', this.expBar), statRow('Job', this.jexpBar),
        h('div', { class: 'foot' }, this.lumaEl, this.pointsEl)),
      this.buffsEl,
      this.targetEl,
      this.bossEl,
      h('div', { class: 'panel minimap' }, this.miniCanvas, h('div', { class: 'row', style: 'justify-content:space-between;margin-top:3px' }, this.miniName, this.miniCoords), zoomBox),
      this.trackerEl,
      h('div', { class: 'panel chat' }, chatTabs, this.chatLog, this.chatInput),
      this.hotbarEl,
      this.castEl,
      this.toastArea,
      autoBox,
      menu,
      this.menuToggle,
    );
    for (const el of [this.root.querySelector('.hud-status'), this.root.querySelector('.minimap'), this.trackerEl, this.root.querySelector('.chat'), this.hotbarEl, autoBox, menu, this.menuToggle]) {
      (el as HTMLElement).style.pointerEvents = 'auto';
    }
    this.buildHotbar();
    this.showZoom(this.app.settings.zoom ?? 1.5);
    this.setMenuCollapsed(!!this.app.settings.menuCollapsed);
  }

  /** The icon menu folds away with the Menu button (state saved). */
  setMenuCollapsed(on: boolean) {
    this.app.settings.menuCollapsed = on;
    this.menuEl?.classList.toggle('collapsed', on);
    this.menuToggle.textContent = on ? '▲ Menu' : '▼ Menu';
    this.app.persist();
  }

  private toggleAutoFarm() {
    const au = this.app.world?.auto;
    if (!au) return;
    if (au.mode === 'off') au.start('farm'); else au.stop('manual control');
    this.updateAutoButtons();
  }

  private toggleAutoQuest() {
    const au = this.app.world?.auto;
    if (!au) return;
    if (au.mode === 'quest') au.stop('manual control'); else au.start('quest');
    this.updateAutoButtons();
  }

  private updateAutoButtons() {
    const mode = this.app.world?.auto.mode ?? 'off';
    setChildren(this.autoBtn, h('b', {}, 'AUTO'), h('small', {}, mode === 'farm' ? 'ON' : mode === 'quest' ? 'Quest' : 'OFF'));
    this.autoBtn.classList.toggle('on', mode !== 'off');
    this.autoQuestBtn.textContent = mode === 'quest' ? '■ Stop Auto Quest' : '▶ Auto Quest';
    this.autoQuestBtn.classList.toggle('primary', mode === 'quest');
  }

  focusChat() { this.chatInput.focus(); }
  startWhisper(name: string) { this.chatInput.value = `/w ${name} `; this.chatInput.focus(); }
  showZoom(z: number) { this.zoomEl.textContent = `${Math.round(z * 100)}%`; this.zoomSlider.value = String(Math.round(z * 100)); }
  get chatFocused() { return document.activeElement === this.chatInput; }

  private submitChat() {
    const text = this.chatInput.value.trim();
    this.chatInput.value = '';
    if (!text) return;
    if (text.startsWith('@')) { this.app.gmCommand(text); return; }
    if (this.app.online.chat(text)) return;
    if (text.startsWith('/')) { this.app.chatCommand(text); return; }
    this.log(`[${this.app.world?.char.name ?? 'You'}] ${text}  (offline — log in to a server in the Social window, G, to chat with other players)`, 'chat');
  }

  log(text: string, channel: Channel = 'system') {
    const line = h('div', { class: `m-${channel}`, dataset: { ch: channel } }, text);
    if (this.chatFilter !== 'all' && this.chatFilter !== channel) line.classList.add('hidden');
    const atBottom = this.chatLog.scrollTop + this.chatLog.clientHeight >= this.chatLog.scrollHeight - 4;
    this.chatLog.appendChild(line);
    while (this.chatLog.childElementCount > 200) this.chatLog.firstElementChild!.remove();
    if (atBottom) this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  private applyChatFilter() {
    for (const el of Array.from(this.chatLog.children) as HTMLElement[]) {
      el.classList.toggle('hidden', this.chatFilter !== 'all' && el.dataset.ch !== this.chatFilter && !(this.chatFilter === 'system' && el.dataset.ch === 'error'));
    }
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  /** Big centre-screen announcements, shown one at a time. */
  banner(title: string, sub = '', kind: '' | 'boss' = '') {
    if (this.bannerQueue.some((b) => b.title === title)) return;
    this.bannerQueue.push({ title, sub, kind });
    if (this.bannerQueue.length > 4) this.bannerQueue.splice(1, 1);
    if (this.bannerQueue.length === 1) this.showNextBanner();
  }

  private bannerQueue: { title: string; sub: string; kind: '' | 'boss' }[] = [];

  private showNextBanner() {
    const next = this.bannerQueue[0];
    if (!next) return;
    const fast = this.bannerQueue.length > 1;
    const ms = fast ? 1800 : 3200;
    const b = h('div', { class: `banner ${next.kind}`, style: { animationDuration: `${ms}ms` } }, h('div', { class: 'b1' }, next.title), next.sub ? h('div', { class: 'b2' }, next.sub) : null);
    this.root.appendChild(b);
    setTimeout(() => { b.remove(); this.bannerQueue.shift(); this.showNextBanner(); }, ms);
  }

  toast(text: string, error = false) {
    const t = h('div', { class: `toast${error ? ' error' : ''}` }, text);
    this.toastArea.appendChild(t);
    while (this.toastArea.childElementCount > 4) this.toastArea.firstElementChild!.remove();
    setTimeout(() => t.remove(), 2700);
  }

  // ---------------------------------------------------------------- hotbar
  buildHotbar() {
    const w = this.app.world;
    const slots = w?.char.hotbar ?? [];
    setChildren(this.hotbarEl, Array.from({ length: HOTBAR_SLOTS }, (_, i) => {
      const s = slots[i] ?? null;
      // Slots 1–10 are the bottom row (keys 1–0); 11–20 the row above (Shift + 1–0).
      const el = h('div', { class: `hslot${i >= 10 ? ' row2' : ''}`, dataset: { i: String(i) }, title: this.slotTitle(s), style: `grid-row:${i >= 10 ? 1 : 2};grid-column:${(i % 10) + 1}` },
        s ? h('img', { src: this.slotIcon(s), draggable: false }) : null,
        h('span', { class: 'key' }, this.app.keyLabel(`hotbar${i + 1}`)),
        h('span', { class: 'cnt' }),
        h('div', { class: 'cd' }),
        h('span', { class: 'cdt' }));
      el.addEventListener('click', () => this.app.useHotbar(i));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (w) { w.char.hotbar[i] = null; this.buildHotbar(); } });
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault(); el.classList.remove('over');
        const d = getDragData(e);
        if (!d || !w) return;
        if (d.type === 'skill') this.app.assignHotbar(i, { type: 'skill', id: d.id });
        else if (d.type === 'item') this.app.assignHotbar(i, { type: 'item', id: d.id });
        else if (d.type === 'inv') {
          const inst = w.char.inventory.find((x) => x.uid === d.id);
          if (inst) this.app.assignHotbar(i, { type: 'item', id: inst.itemId });
        }
      });
      return el;
    }));
  }

  private slotIcon(s: HotbarSlot): string {
    const d = this.app.data;
    if (s.type === 'skill') { const sk = d.skills.get(s.id); return sk ? skillIconUrl(sk) : ''; }
    const it = d.items.get(s.id);
    return it ? itemIconUrl(it) : '';
  }

  private slotTitle(s: HotbarSlot | null): string {
    if (!s) return 'Empty — drag a skill or item here';
    const d = this.app.data;
    return s.type === 'skill' ? d.skills.get(s.id)?.name ?? s.id : d.items.get(s.id)?.name ?? s.id;
  }

  private updateHotbar() {
    const w = this.app.world!;
    const slots = this.hotbarEl.children;
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const s = w.char.hotbar[i];
      const el = slots[i] as HTMLElement;
      if (!el) continue;
      const cnt = el.querySelector('.cnt') as HTMLElement, cd = el.querySelector('.cd') as HTMLElement, cdt = el.querySelector('.cdt') as HTMLElement;
      if (!s) { cnt.textContent = ''; cd.style.background = ''; cdt.textContent = ''; continue; }
      let until = 0, total = 1;
      if (s.type === 'skill') {
        const sk = w.data.skills.get(s.id);
        until = w.player.cooldowns[s.id] ?? 0;
        total = sk?.cooldownMs || 1;
        const lvl = w.skillLevel(s.id);
        cnt.textContent = lvl ? `${lvl}` : '';
        el.classList.toggle('nomp', !!sk && (lvl === 0 || w.char.mp < w.skillMpCost(sk, Math.max(1, lvl))));
      } else {
        const it = w.data.items.get(s.id);
        until = w.player.itemCooldowns[s.id] ?? 0;
        total = it?.cooldownMs || 500;
        const n = countItem(w.char, s.id);
        cnt.textContent = `${n}`;
        el.classList.toggle('nomp', n === 0);
      }
      const left = until - w.time;
      if (left > 0) {
        const pct = Math.min(1, left / total);
        cd.style.background = `conic-gradient(rgba(0,0,0,0.65) ${pct * 360}deg, transparent 0)`;
        cdt.textContent = left > 1000 ? `${Math.ceil(left / 1000)}` : '';
      } else { cd.style.background = ''; cdt.textContent = ''; }
    }
  }

  // ---------------------------------------------------------------- minimap
  resetMinimap() {
    const w = this.app.world!;
    const map = w.map;
    const c = document.createElement('canvas');
    c.width = map.width * 3; c.height = map.height * 3;
    const ctx = c.getContext('2d')!;
    const pal = w.data.tilesets.get(map.def.tileset)!.palette;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const g = map.ground[i];
      // Colours come from the map's tileset palette so every region reads differently.
      let col = g === 'water' ? pal.water1 : g === 'wood_plank' ? pal.trunk : g === 'dirt' || g === 'soil' ? pal.dirt2 : g === 'path_stone' ? pal.stone2 : g === 'ruin_floor' ? (pal.ruin2 ?? pal.stone2) : g === 'sand' ? pal.sand1 : pal.grass3;
      if (map.collision[i]) col = map.wall[i] === 'thicket' ? pal.thicket2 : map.wall[i] === 'ruin_wall' ? (pal.thicket1 ?? '#4a3a2a') : '#4a3a2a';
      ctx.fillStyle = col;
      ctx.fillRect(x * 3, y * 3, 3, 3);
    }
    for (const b of map.buildings) { ctx.fillStyle = '#8a4a3a'; ctx.fillRect(b.x * 3, b.y * 3, b.w * 3, b.h * 3); }
    this.miniBase = c;
    this.miniName.textContent = map.def.name;
    this.buildHotbar();
  }

  private drawMinimap() {
    const w = this.app.world!;
    if (!this.miniBase) this.resetMinimap();
    const ctx = this.miniCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 186, 140);
    ctx.drawImage(this.miniBase!, 0, 0, 186, 140);
    const sx = 186 / (w.map.width * TILE), sy = 140 / (w.map.height * TILE);
    const dot = (x: number, y: number, col: string, r = 2) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x * sx) - r, Math.round(y * sy) - r, r * 2, r * 2); };
    for (const p of w.map.def.portals) dot((p.x + p.w / 2) * TILE, (p.y + p.h / 2) * TILE, '#7fd6ff', 3);
    for (const m of w.monsters.values()) if (!m.dead) dot(m.x, m.y, m.boss ? '#ff3b30' : m.targetId ? '#ff8a3a' : '#e04a3a', m.boss ? 4 : 1.5);
    for (const n of w.npcs) dot(n.x, n.y, '#ffd34d', 2);
    dot(w.player.x, w.player.y, '#ffffff', 3);
    this.miniCoords.textContent = `${Math.floor(w.player.x / TILE)}, ${Math.floor(w.player.y / TILE)}${w.map.def.levelRange ? `  ·  Lv.${w.map.def.levelRange.join('–')}` : w.map.def.type === 'instance' ? '  ·  Memorial dungeon' : w.map.def.type === 'town' ? '  ·  Town' : ''}`;
  }

  // ---------------------------------------------------------------- per frame
  private bonusEl = h('div', { class: 'bonus-ind', id: 'bonus-ind', style: 'display:none' });

  update() {
    const w = this.app.world;
    if (!w) return;
    const c = w.char, s = w.stats;
    this.hpBar.set(c.hp, s.maxHp);
    this.mpBar.set(c.mp, s.maxMp);
    const now = performance.now();
    this.updateCast();
    this.updateBoss();
    if (now - this.lastSlow < 120) return;
    this.lastSlow = now;
    if (!this.instTimer.parentElement) this.root.appendChild(this.instTimer);
    if (!this.clockEl.parentElement) this.root.appendChild(this.clockEl);
    if (!this.bonusEl.parentElement) this.root.appendChild(this.bonusEl);
    const bonus = w.bonus();
    const bonusText = bonus.labels.length ? `🎉 Bonus event: ${bonus.labels.join(' · ')}` : '';
    if (this.bonusEl.textContent !== bonusText) { this.bonusEl.textContent = bonusText; this.bonusEl.style.display = bonusText ? '' : 'none'; }
    if (!this.autoEl.parentElement) { this.root.appendChild(this.autoEl); this.autoEl.addEventListener('click', () => this.app.world?.auto.stop('manual control')); }
    const au = w.auto;
    this.updateAutoButtons();
    this.autoEl.style.display = au.mode === 'off' ? 'none' : 'block';
    if (au.mode !== 'off') this.autoEl.textContent = `● ${au.mode === 'farm' ? 'AUTO FARM' : 'AUTO QUEST'} — ${au.status || '…'}   (click to stop)`;
    const ev = w.event;
    const evLeft = ev ? Math.max(0, Math.ceil((ev.endsAt - w.time) / 1000)) : 0;
    const raid = ev && !ev.done ? `⚔ Raid: ${ev.mapName} ${Math.floor(evLeft / 60)}:${String(evLeft % 60).padStart(2, '0')}` : '';
    this.clockEl.textContent = raid;
    this.clockEl.style.display = raid ? 'block' : 'none';
    const ins = w.instance, idef = ins && w.data.instances.get(ins.id);
    if (ins && idef) {
      const left = Math.max(0, Math.ceil((ins.endsAt - w.time) / 1000));
      this.instTimer.style.display = 'block';
      this.instTimer.textContent = ins.done ? `${idef.name} — cleared!` : `${idef.name} · ${idef.floors.length > 4 ? 'Floor' : 'Room'} ${ins.floor}/${idef.floors.length}${ins.cleared ? ' · cleared' : ''} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    } else this.instTimer.style.display = 'none';
    const cls = w.data.classes.get(c.classId)!;
    this.whoName.textContent = c.name;
    this.whoClass.textContent = cls.name;
    this.baseLvEl.textContent = `Base Lv. ${c.baseLevel}`;
    this.jobLvEl.textContent = `Job Lv. ${c.jobLevel}`;
    const pts = [c.statPoints ? `Stat points ${c.statPoints}` : '', c.skillPoints ? `Skill points ${c.skillPoints}` : ''].filter(Boolean).join(' · ');
    this.pointsEl.textContent = pts;
    this.pointsEl.style.display = pts ? '' : 'none';
    this.pointsEl.onclick = () => this.app.windows.open(c.statPoints ? 'status' : 'skills');
    const bn = expToNextBase(w.data, c.baseLevel), jn = expToNextJob(w.data, c.jobLevel);
    this.expBar.set(c.baseExp, bn, `${((c.baseExp / bn) * 100).toFixed(1)}%`);
    this.jexpBar.set(c.jobExp, jn, c.jobLevel >= cls.maxJobLevel ? 'MAX' : `${((c.jobExp / jn) * 100).toFixed(1)}%`);
    this.lumaEl.textContent = `${c.luma.toLocaleString()} Luma`;
    const portraitKey = JSON.stringify(lookForCharacter(w.data, c));
    if (portraitKey !== this.lastPortraitKey) {
      this.lastPortraitKey = portraitKey;
      const p = portraitFromSheet(generateCharacterSheet(lookForCharacter(w.data, c)), 3);
      const ctx = this.portrait.getContext('2d')!;
      ctx.clearRect(0, 0, 96, 96);
      ctx.drawImage(p, 0, 0);
    }
    this.updateHotbar();
    this.drawMinimap();
    this.updateBuffs();
    this.updateTarget();
    this.updateTracker();
  }

  private updateCast() {
    const w = this.app.world!;
    const cast = w.player.cast;
    if (!cast) { this.castEl.classList.add('hidden'); return; }
    this.castEl.classList.remove('hidden');
    const pct = (w.time - cast.startedAt) / (cast.endsAt - cast.startedAt);
    const name = w.data.skills.get(cast.skillId)?.name ?? cast.skillId;
    setChildren(this.castEl, `Casting ${name}`, h('div', { class: 'bar' }, h('div', { class: 'fill', style: { width: `${Math.min(100, pct * 100)}%` } })));
  }

  private updateBuffs() {
    const w = this.app.world!;
    const items: HTMLElement[] = [];
    for (const b of w.player.buffs) {
      items.push(h('div', { class: 'buff', style: { background: b.color }, title: b.name }, `${Math.ceil((b.expiresAt - w.time) / 1000)}`));
    }
    for (const st of w.player.statuses) {
      const def = w.data.statuses.get(st.id)!;
      items.push(h('div', { class: 'buff debuff', style: { background: def.color }, title: `${def.name}: ${def.description}` }, `${Math.ceil((st.expiresAt - w.time) / 1000)}`));
    }
    setChildren(this.buffsEl, items);
  }

  private updateTarget() {
    const w = this.app.world!;
    const t = w.currentTarget;
    if (!t || t.dead || t.boss) { this.targetEl.classList.add('hidden'); return; }
    this.targetEl.classList.remove('hidden');
    const sts = t.statuses.map((s) => w.data.statuses.get(s.id)!.name).join(', ');
    setChildren(this.targetEl,
      h('div', { class: 'tname' }, `${t.def.name}  `, h('span', { class: 'muted' }, `Lv.${t.def.level} · ${t.def.element} ${t.def.elementLevel ?? 1} · ${t.def.race}`)),
      barEl('hp', t.hp, t.maxHp, `${Math.ceil(t.hp)} / ${t.maxHp}`),
      sts ? h('div', { class: 'muted', style: 'font-size:11px;margin-top:2px' }, sts) : null);
  }

  private updateBoss() {
    const w = this.app.world!;
    const b = w.activeBoss;
    if (!b || !b.boss) { this.bossEl.classList.add('hidden'); return; }
    this.bossEl.classList.remove('hidden');
    this.bossEl.classList.toggle('enraged', b.boss.enraged);
    setChildren(this.bossEl,
      h('div', { class: 'bname' }, `${b.def.name}`, b.boss.enraged ? h('span', { class: 'bad' }, '  ENRAGED') : null),
      h('div', { class: 'bphase' }, `${b.boss.def.title} — ${b.boss.def.phases[b.boss.phase].name}`),
      barEl('hp', b.hp, b.maxHp, `${Math.ceil(b.hp).toLocaleString()} / ${b.maxHp.toLocaleString()}  (${Math.ceil((b.hp / b.maxHp) * 100)}%)`));
  }

  private updateTracker() {
    const w = this.app.world!;
    const list = activeQuests(w.data, w.char).sort((a, b) => order(a.def.category) - order(b.def.category));
    // Every quest finished (the 5 tutorial quests): the quest panel goes away.
    const allDone = [...w.data.quests.keys()].every((id) => w.char.quests[id]?.status === 'completed');
    this.trackerEl.style.display = allDone ? 'none' : '';
    if (allDone) return;
    if (!list.length) {
      setChildren(this.trackerEl, h('div', { class: 'thead' }, h('h4', {}, 'Quests'), this.autoQuestBtn), h('div', { class: 'muted', style: 'font-size:11px' }, 'No active quests. Look for NPCs with a ! above them.'));
      return;
    }
    setChildren(this.trackerEl, h('div', { class: 'thead' }, h('h4', {}, `Quests (${list.length})`), this.autoQuestBtn), list.slice(0, 5).map(({ def, prog }) =>
      h('div', { class: 'q' },
        h('div', { class: 'qn' }, prog.status === 'ready' ? '✔ ' : '', def.name),
        prog.status === 'ready'
          ? h('div', { class: 'qo done' }, `Return to ${w.data.npcs.get(def.turnInNpc)?.name}`)
          : def.objectives.map((o, i) => {
            const n = objectiveTarget(o);
            const done = prog.counts[i] >= n;
            return h('div', { class: `qo${done ? ' done' : ''}` }, `${o.label}${n > 1 ? ` ${prog.counts[i]}/${n}` : done ? ' ✔' : ''}`);
          }))));
  }
}

function order(cat: string) { return ['main', 'job', 'side', 'daily', 'event'].indexOf(cat); }

function bar(kind: string) {
  const fill = h('div', { class: 'fill' });
  const txt = h('div', { class: 'txt' });
  const el = h('div', { class: `bar ${kind}` }, fill, txt);
  return {
    el,
    set(v: number, max: number, label?: string) {
      fill.style.width = `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
      txt.textContent = label ?? `${Math.floor(v)} / ${max}`;
    },
  };
}

function barEl(kind: string, v: number, max: number, label: string) {
  const b = bar(kind);
  b.set(v, max, label);
  return b.el;
}
