// Draggable game windows: inventory, equipment, status, skills, quests, world
// map, settings — plus NPC dialogue, shop, storage, tooltips and menus.
import type { App } from './app';
import { keyFromEvent } from './keys';
import { defaultServerUrl } from '../net/client';
import { drawPriceChart } from './chart';
import { computeDerivedStats } from '../core/formulas';
import { HOUR_MS, nextRestockMs, priceChangePct, priceHistory, shopStock, traderBuyPrice, traderPrice } from '../core/market';
import { BREW_BOWL, BREW_RECIPES, brewChance, canBrew, missingFor } from '../core/brewing';
import { ACHIEVEMENTS, BONUS_HOURS, DAILY_REWARDS, dailyStatus, titleOf, type AchievementDef } from '../core/achievements';
import { h, setChildren, RARITY_COLOR } from './dom';
import { isTouchDevice } from './touch';
import { getLang, LANGS, type Lang } from './i18n';
import { itemIconUrl, skillIconUrl } from '../game/art/icons';
import { generateCharacterSheet, portraitFromSheet } from '../game/art/characterSprite';
import { lookForCharacter, SpritePreview } from './screens';
import { getDragData, setDragData } from './hud';
import { canRebirth, classLineage, skillCheck } from '../core/character';
import { buyPrice, canEquip, countItem, filterInventory, inventoryWeight, sellPrice } from '../core/inventory';
import { refineFee, refineOre, simulateRefine, type RefineKind } from '../core/refine';
import { forgeChanceRaw } from '../core/forge';
import { DROP_OPTION_COUNT, optionOdds } from '../core/options';
import { homunExpToNext, homunStats } from '../core/homunculus';
import { CART_SLOTS, CART_WEIGHT, cartWeight, findInstance } from '../core/inventory';
import { canLearnRune, runePointsLeft, runePointsTotal } from '../core/runes';
import { hungerLabel, intimacyLabel, LOYAL_AT } from '../core/pets';
import { canRaiseStat, expToNextBase, expToNextJob, statRaiseCost } from '../core/formulas';
import {
  activeQuests, isComplete, objectiveTarget, questsOfferedBy, questsToTurnIn,
} from '../core/quests';
import type { EquipSlot, ItemDef, ItemInstance, ItemType, NpcDef, QuestDef, StatKey, StatModifiers } from '../core/types';
import { EQUIP_SLOTS, STAT_KEYS } from '../core/types';
import { DEFAULT_KEYBINDS } from '../core/save';
import { audio } from '../game/audio/audio';
import * as gm from '../core/gm';
import { MAX_REFINE, refineInfo } from '../core/refine';
import { compoundTargets, itemDisplayName } from '../core/cards';
import { canForge, CRUMB_ATK, ELEMENT_STONES, forgeChance, STAR_CRUMB } from '../core/forge';
import { ENCHANT_COST, MAX_OPTIONS, optionLabel, REROLL_COST } from '../core/options';

type DbTab = 'monsters' | 'items' | 'cards' | 'refine' | 'forge' | 'options' | 'combos' | 'pets' | 'elements';
export type WindowId = 'inventory' | 'equipment' | 'status' | 'skills' | 'quests' | 'worldMap' | 'settings' | 'shop' | 'storage' | 'admin' | 'database' | 'pet' | 'homun' | 'cart' | 'runes' | 'social' | 'auto' | 'trader' | 'market' | 'achievements' | 'daily' | 'brew';

interface WinState { el: HTMLElement; body: HTMLElement; render: () => void; open: boolean }

const MOD_LABEL: Record<string, string> = {
  str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK', maxHp: 'Max HP', maxMp: 'Max MP', maxHpPct: 'Max HP %', maxMpPct: 'Max MP %',
  patk: 'ATK', matk: 'MATK', patkPct: 'ATK %', matkPct: 'MATK %', pdef: 'DEF', mdef: 'MDEF', pdefPct: 'DEF %', hit: 'HIT', flee: 'FLEE', crit: 'CRIT',
  critDmg: 'Crit DMG %', aspdPct: 'Attack Speed %', moveSpeedPct: 'Move Speed %', castTimePct: 'Cast Time %', cdrPct: 'Cooldown -%', hpRegen: 'HP Regen', mpRegen: 'MP Regen',
  weightLimit: 'Weight Limit', attackRange: 'Range', counterChance: 'Counter %', damageToMpPct: 'Damage → MP %', stealth: 'Stealth',
};

export function modsText(m?: StatModifiers): string[] {
  if (!m) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (v == null) continue;
    if (k === 'elementDamagePct' || k === 'elementResistPct') {
      for (const [el, n] of Object.entries(v as Record<string, number>)) out.push(`${el} ${k === 'elementDamagePct' ? 'damage' : 'resist'} ${n > 0 ? '+' : ''}${n}%`);
    } else if (k === 'raceDamagePct' || k === 'sizeDamagePct') {
      for (const [r, n] of Object.entries(v as Record<string, number>)) out.push(`+${n}% damage vs ${r}${k === 'sizeDamagePct' ? '-size' : ''} monsters`);
    } else if (k === 'onHitStatusPct') {
      for (const [st, n] of Object.entries(v as Record<string, number>)) out.push(`${n}% chance to ${st} on hit`);
    } else if (k === 'hpDrainPct') {
      out.push(`Drain ${v}% of damage as HP`);
    } else if (k === 'raceResistPct') {
      for (const [r, n] of Object.entries(v as Record<string, number>)) out.push(`-${n}% damage from ${r} monsters`);
    } else out.push(`${MOD_LABEL[k] ?? k} ${(v as number) > 0 ? '+' : ''}${v}`);
  }
  return out;
}

export class WindowManager {
  private wins = new Map<WindowId, WinState>();
  private z = 100;
  private tooltip = h('div', { class: 'panel tooltip hidden' });
  private ctxMenu: HTMLElement | null = null;
  private dialogEl: HTMLElement | null = null;
  private modalEl: HTMLElement | null = null;
  shopId: string | null = null;
  invFilter: 'all' | ItemType = 'all';
  selectedQuest: string | null = null;
  private listening: string | null = null;

  constructor(private app: App, private root: HTMLElement) {
    root.appendChild(this.tooltip);
    document.addEventListener('mousedown', (e) => {
      if (this.ctxMenu && !this.ctxMenu.contains(e.target as Node)) this.closeContext();
    });
    this.define('inventory', 'Inventory', 470, 120, () => this.renderInventory());
    this.define('equipment', 'Equipment', 200, 120, () => this.renderEquipment());
    this.define('status', 'Character Status', 330, 90, () => this.renderStatus());
    this.define('skills', 'Skill Tree', 380, 60, () => this.renderSkills());
    this.define('quests', 'Quest Journal', 300, 80, () => this.renderQuests());
    this.define('worldMap', 'World Map', 240, 60, () => this.renderWorldMap());
    this.define('settings', 'Settings', 420, 70, () => this.renderSettings());
    this.define('shop', 'Shop', 16, 90, () => this.renderShop());
    this.define('storage', 'Storage', 16, 90, () => this.renderStorage());
    this.define('admin', 'GM / Admin Tools', 820, 70, () => this.renderAdmin());
    this.define('database', 'Database', 200, 50, () => this.renderDatabase());
    this.define('pet', 'Pet', 520, 90, () => this.renderPet());
    this.define('homun', 'Homunculus', 520, 120, () => this.renderHomun());
    this.define('cart', 'Pushcart', 16, 90, () => this.renderCart());
    this.define('runes', 'Rune Constellation', 300, 70, () => this.renderRunes());
    this.define('social', 'Social — Online Play', 360, 60, () => this.renderSocial());
    this.define('auto', 'Auto Settings', 440, 120, () => this.renderAuto());
    this.define('trader', 'Market Trader', 300, 60, () => this.renderTrader());
    this.define('market', 'Market Hall', 280, 50, () => this.renderMarket());
    this.define('achievements', 'Achievements & Titles', 260, 60, () => this.renderAchievements());
    this.define('daily', 'Daily Rewards', 320, 120, () => this.renderDaily());
    this.define('brew', 'Brewing', 300, 80, () => this.renderBrew());
  }

  get anyOpen() { return [...this.wins.values()].some((w) => w.open) || !!this.dialogEl || !!this.modalEl; }

  private define(id: WindowId, title: string, x: number, y: number, render: () => void) {
    const body = h('div', { class: 'wbody' });
    const titleBar = h('div', { class: 'wtitle' }, title, h('span', { class: 'x', onclick: () => this.close(id) }, '✕'));
    const el = h('div', { class: 'panel win hidden', id: `win-${id}`, style: { left: `${x}px`, top: `${y}px` } }, titleBar, body);
    // Drag by title bar (positions are in the 1280x720 UI space).
    el.addEventListener('pointerdown', () => { el.style.zIndex = String(++this.z); });
    titleBar.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).classList.contains('x')) return;
      const scale = this.app.uiScale;
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
      const move = (ev: PointerEvent) => { el.style.left = `${Math.max(0, Math.min(1180, ox + (ev.clientX - sx) / scale))}px`; el.style.top = `${Math.max(0, Math.min(680, oy + (ev.clientY - sy) / scale))}px`; };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
    this.root.appendChild(el);
    this.wins.set(id, { el, body, render, open: false });
  }

  open(id: WindowId) {
    const w = this.wins.get(id)!;
    w.open = true;
    w.el.classList.remove('hidden');
    w.el.style.zIndex = String(++this.z);
    w.render();
    audio.play('ui_open');
  }
  close(id: WindowId) {
    const w = this.wins.get(id)!;
    w.open = false;
    w.el.classList.add('hidden');
    this.hideTooltip();
    if (id === 'shop') this.shopId = null;
  }
  toggle(id: WindowId) { if (this.wins.get(id)!.open) this.close(id); else this.open(id); }
  isOpen(id: WindowId) { return this.wins.get(id)?.open ?? false; }
  closeAll() {
    for (const id of this.wins.keys()) this.close(id);
    this.closeDialog();
    this.closeContext();
  }
  /** Close the top-most thing; returns false if nothing was open. */
  closeTop(): boolean {
    if (this.ctxMenu) { this.closeContext(); return true; }
    if (this.modalEl && this.modalEl.dataset.dismissable === '1') { this.closeModal(); return true; }
    if (this.dialogEl) { this.closeDialog(); return true; }
    let top: [WindowId, WinState] | null = null;
    for (const e of this.wins) if (e[1].open && (!top || Number(e[1].el.style.zIndex) > Number(top[1].el.style.zIndex))) top = e;
    if (top) { this.close(top[0]); return true; }
    return false;
  }
  refresh() { for (const w of this.wins.values()) if (w.open) w.render(); }

  // ---------------------------------------------------------------- tooltip / context
  showTooltip(e: MouseEvent, content: HTMLElement[]) {
    setChildren(this.tooltip, content);
    this.tooltip.classList.remove('hidden');
    const r = this.root.getBoundingClientRect(), s = this.app.uiScale;
    let x = (e.clientX - r.left) / s + 16, y = (e.clientY - r.top) / s + 12;
    if (x > 1280 - 290) x -= 310;
    if (y > 720 - 220) y -= 200;
    this.tooltip.style.left = `${x}px`; this.tooltip.style.top = `${y}px`;
  }
  hideTooltip() { this.tooltip.classList.add('hidden'); }

  /** Action menu with a heading (e.g. another player's name) at the mouse. */
  openContextAt(e: MouseEvent, items: [string, () => void][], heading: string) {
    this.openContext(e, items);
    this.ctxMenu?.prepend(h('div', { class: 'ctx-title' }, heading));
  }

  /** Small action menu at the mouse. With a title, the first action is shown as a big button (Equip / Use). */
  private openContext(e: MouseEvent, items: [string, () => void][], title?: string) {
    this.closeContext();
    const r = this.root.getBoundingClientRect(), s = this.app.uiScale;
    const run = (fn: () => void) => () => { this.closeContext(); fn(); };
    const rest = title ? items.slice(1) : items;
    this.ctxMenu = h('div', { class: 'panel ctx-menu', id: 'item-actions', style: { left: `${(e.clientX - r.left) / s + 6}px`, top: `${(e.clientY - r.top) / s + 6}px` } },
      title ? h('div', { class: 'ctx-title' }, title) : null,
      title ? h('button', { class: 'btn primary ctx-main', onclick: run(items[0][1]) }, items[0][0]) : null,
      rest.map(([label, fn]) => h('div', { onclick: run(fn) }, label)));
    this.root.appendChild(this.ctxMenu);
  }
  private closeContext() { this.ctxMenu?.remove(); this.ctxMenu = null; }

  itemTooltip(def: ItemDef, inst?: ItemInstance): HTMLElement[] {
    const w = this.app.world!;
    const optCol = ['', '#7fb0ff', '#5ad8c8', '#c9a6ff'][Math.min(3, inst?.options?.length ?? 0)];
    const out: HTMLElement[] = [h('div', { class: 'tn', style: { color: optCol || RARITY_COLOR[def.rarity] } }, itemDisplayName(def, inst))];
    const typeLine = def.type === 'equipment'
      ? `${def.rarity} ${def.weaponType ?? def.slot}${def.weaponLevel ? ` · Weapon Lv ${def.weaponLevel}` : ''}${def.twoHanded ? ' (two-handed)' : ''}${(inst?.element ?? def.element) ? ` · ${inst?.element ?? def.element}` : ''}`
      : `${def.rarity} ${def.type}`;
    out.push(h('div', { class: 'tt' }, typeLine));
    for (const line of modsText(def.mods)) out.push(h('div', { class: 'good' }, line));
    if (def.card) {
      out.push(h('div', { class: 'tt' }, `Compounds into: ${def.card.equip}`));
      for (const line of modsText(def.card.mods)) out.push(h('div', { class: 'good' }, line));
    }
    for (const ac of [def.autocast, def.card?.autocast]) if (ac) out.push(h('div', { style: 'color:#7fd6ff' }, `${ac.chancePct}% on hit: cast ${w.data.skills.get(ac.skillId)?.name ?? ac.skillId} Lv.${ac.level}`));
    const active = new Set(w.stats.activeCombos);
    for (const cb of w.data.combos.values()) if (cb.parts.includes(def.id)) {
      out.push(h('div', { style: `color:${active.has(cb.id) ? '#6fe08a' : '#b0a890'}` }, `${active.has(cb.id) ? '✓' : '○'} ${cb.name}: ${modsText(cb.mods).join(', ')}`));
      out.push(h('div', { class: 'muted', style: 'font-size:10px' }, `   with ${cb.parts.filter((x) => x !== def.id).map((x) => w.data.items.get(x)?.name ?? x).join(' + ')}`));
    }
    for (const o of inst?.options ?? []) out.push(h('div', { style: `color:${optCol}` }, `✦ ${optionLabel(o)}`));
    if (inst?.crafter) out.push(h('div', { class: 'muted' }, `Forged by ${inst.crafter}${inst.starCrumbs ? ` · +${CRUMB_ATK[inst.starCrumbs]} ATK from star crumbs` : ''}`));
    for (const cardId of inst?.cards ?? []) {
      const cd = w.data.items.get(cardId);
      if (cd?.card) out.push(h('div', { style: 'color:#c9a6ff' }, `◆ ${cd.name}: ${modsText(cd.card.mods).join(', ')}`));
    }
    if (def.cardSlots && !inst) out.push(h('div', { class: 'muted' }, `${def.cardSlots} card slot${def.cardSlots > 1 ? 's' : ''}`));
    if (def.attackRange && def.slot === 'weapon') out.push(h('div', {}, `Range ${def.attackRange} · ${def.attackKind}`));
    if (def.use) for (const u of def.use) {
      if (u.type === 'heal') out.push(h('div', { class: 'good' }, `Restores ${[u.hp ? `${u.hp} HP` : '', u.mp ? `${u.mp} MP` : ''].filter(Boolean).join(' & ')}`));
    }
    if (inst?.pet) out.push(h('div', { style: 'color:#ffb0d8' }, `♥ ${inst.pet.name} · ${intimacyLabel(inst.pet.intimacy)} (${inst.pet.intimacy}/1000) · ${hungerLabel(inst.pet.hunger)}`));
    if (def.lure) out.push(h('div', { class: 'muted' }, 'Target the monster, then use this item.'));
    out.push(h('div', { style: 'margin-top:4px' }, def.description));
    out.push(...this.compareLines(def, inst));
    if (def.type === 'equipment') {
      const chk = canEquip(w.data, w.char, def);
      if (def.equipLevel && def.equipLevel > 1) out.push(h('div', { class: w.char.baseLevel >= def.equipLevel ? 'muted' : 'bad' }, `Requires Lv.${def.equipLevel}`));
      if (def.classes) out.push(h('div', { class: def.classes.includes(w.char.classId) ? 'muted' : 'bad' }, `Class: ${def.classes.map((c) => w.data.classes.get(c)?.name).join(', ')}`));
      if (!chk.ok && !def.classes && !(def.equipLevel && def.equipLevel > w.char.baseLevel)) out.push(h('div', { class: 'bad' }, chk.error));
    }
    out.push(h('div', { class: 'tt', style: 'margin-top:4px' }, `Weight ${def.weight} · Sell ${sellPrice(w.data, def.id, w.char)} Luma${inst?.bound || def.bound ? ' · Bound' : ''}${inst?.locked ? ' · Locked' : ''}`));
    return out;
  }

  /** Item compare: your stats with this item worn instead of what is in that slot now (green = better). */
  private compareCache = new Map<string, HTMLElement[]>();
  private compareLines(def: ItemDef, inst?: ItemInstance): HTMLElement[] {
    const w = this.app.world!, c = w.char;
    if (def.type !== 'equipment' || !def.slot || !inst || Object.values(c.equipment).some((e) => e?.uid === inst.uid)) return [];
    const slot: EquipSlot = def.slot === 'accessory' ? (!c.equipment.accessory1 ? 'accessory1' : !c.equipment.accessory2 ? 'accessory2' : 'accessory1') : def.slot as EquipSlot;
    const key = `${inst.uid}:${inst.refine ?? 0}:${JSON.stringify(c.equipment)}:${c.baseLevel}:${JSON.stringify(c.stats)}`;
    const hit = this.compareCache.get(key);
    if (hit) return hit;
    const equipment = { ...c.equipment, [slot]: inst };
    if (slot === 'weapon' && def.twoHanded) delete equipment.shield;
    const now = computeDerivedStats(w.data, c), next = computeDerivedStats(w.data, { ...c, equipment });
    const rows: [string, number][] = [['ATK', next.patk - now.patk], ['MATK', next.matk - now.matk], ['DEF', next.pdef - now.pdef], ['MDEF', next.mdef - now.mdef],
      ['HIT', next.hit - now.hit], ['FLEE', next.flee - now.flee], ['CRIT', next.crit - now.crit], ['ASPD', next.aspd - now.aspd], ['Max HP', next.maxHp - now.maxHp], ['Max MP', next.maxMp - now.maxMp]];
    const cur = c.equipment[slot];
    const lines = rows.filter(([, v]) => Math.abs(v) >= 0.5).map(([k, v]) => h('div', { class: v > 0 ? 'good' : 'bad', style: 'font-size:11px' }, `${k} ${v > 0 ? '▲ +' : '▼ '}${Math.round(v)}`));
    const out = [h('div', { class: 'tt', style: 'margin-top:5px;border-top:1px solid #4a3a2a;padding-top:3px' }, cur ? `Compared with ${w.data.items.get(cur.itemId)?.name ?? ''}${cur.refine ? ` +${cur.refine}` : ''}` : 'Compared with an empty slot'),
      ...(lines.length ? lines : [h('div', { class: 'muted', style: 'font-size:11px' }, 'No change to your stats')])];
    if (this.compareCache.size > 200) this.compareCache.clear();
    this.compareCache.set(key, out);
    return out;
  }

  /** Enchanter: pick unequipped equipment, then add one random option or reroll all. */
  private enchantDialog(uid?: string) {
    const w = this.app.world!, d = w.data, c = w.char;
    if (!uid) {
      const items = c.inventory.filter((i) => d.items.get(i.itemId)?.type === 'equipment');
      this.modal('Enchant equipment', [
        h('p', { class: 'muted', style: 'max-width:420px' }, `Add a random option (${ENCHANT_COST} Luma, up to ${MAX_OPTIONS}) or reroll every option (${REROLL_COST} Luma). Only unequipped items in your bag can be enchanted.`),
        ...(items.length ? items.map((i) => h('button', { class: 'btn small', style: 'display:block;width:100%;margin:2px 0;text-align:left', onclick: () => this.enchantDialog(i.uid) },
          `${itemDisplayName(d.items.get(i.itemId)!, i)}${i.options?.length ? ` · ${i.options.length} option${i.options.length > 1 ? 's' : ''}` : ''}`)) : [h('p', {}, 'No unequipped equipment in your bag.')]),
      ], [['Close', () => this.closeModal()]], true);
      return;
    }
    const inst = c.inventory.find((i) => i.uid === uid);
    if (!inst) { this.enchantDialog(); return; }
    const def = d.items.get(inst.itemId)!;
    this.modal(itemDisplayName(def, inst), [
      h('div', { style: 'min-width:340px' },
        ...(inst.options?.length ? inst.options.map((o) => h('div', { style: 'color:#c9a6ff' }, `✦ ${optionLabel(o)}`)) : [h('div', { class: 'muted' }, 'No options yet.')]),
        h('div', { class: 'muted', style: 'margin-top:6px' }, `You have ${c.luma} Luma.`)),
    ], [
      [`Add option (${ENCHANT_COST})`, () => { w.enchant(uid, 'add'); this.enchantDialog(uid); }],
      [`Reroll all (${REROLL_COST})`, () => { w.enchant(uid, 'reroll'); this.enchantDialog(uid); }],
      ['Back', () => this.enchantDialog()],
    ], true);
  }

  /** Forging: recipe list → materials, optional element stone and star crumbs, live success chance. */
  private forgeDialog(recipeId?: string, stone = '', crumbs = 0) {
    const w = this.app.world!, d = w.data, c = w.char;
    const name = (id: string) => d.items.get(id)?.name ?? id;
    if (!recipeId) {
      const rows = [...d.recipes.values()].map((r) => {
        const def = d.items.get(r.itemId)!;
        const ready = canForge(d, c, { recipeId: r.id }).ok;
        return h('button', { class: 'btn small', style: `display:block;width:100%;margin:2px 0;text-align:left;${ready ? '' : 'opacity:0.7'}`, onclick: () => this.forgeDialog(r.id) },
          `${def.name} (Weapon Lv ${def.weaponLevel ?? 1})${ready ? ' ✔' : ''}`);
      });
      this.modal('Forge a weapon', [h('p', { class: 'muted', style: 'max-width:420px' }, 'Pick a weapon. Materials and the fee are used up even if forging fails. Forged weapons have no card slots but carry your name.'), ...rows], [['Close', () => this.closeModal()]], true);
      return;
    }
    const r = d.recipes.get(recipeId)!, def = d.items.get(r.itemId)!;
    const choice = { recipeId, stone: stone || undefined, crumbs };
    const chance = Math.round(forgeChance(d, c, choice) * 100);
    const check = canForge(d, c, choice);
    const stones = Object.keys(ELEMENT_STONES).filter((id) => countItem(c, id) > 0);
    const stoneSel = h('select', { id: 'forge-stone' }, h('option', { value: '' }, 'No element'), stones.map((id) => h('option', { value: id }, `${name(id)} → ${ELEMENT_STONES[id]}`)));
    stoneSel.value = stone;
    stoneSel.addEventListener('change', () => this.forgeDialog(recipeId, stoneSel.value, crumbs));
    const maxCrumbs = Math.min(3, countItem(c, STAR_CRUMB));
    const crumbSel = h('select', { id: 'forge-crumbs' }, [0, 1, 2, 3].filter((n) => n <= maxCrumbs).map((n) => h('option', { value: String(n) }, n ? `${n} Star Crumb (+${CRUMB_ATK[n]} ATK)` : 'No star crumbs')));
    crumbSel.value = String(Math.min(crumbs, maxCrumbs));
    crumbSel.addEventListener('change', () => this.forgeDialog(recipeId, stone, Number(crumbSel.value)));
    this.modal(`Forge ${def.name}`, [
      h('div', { style: 'min-width:380px' },
        ...r.materials.map((m) => h('div', { class: countItem(c, m.itemId) >= m.qty ? 'good' : 'bad' }, `${name(m.itemId)}: ${countItem(c, m.itemId)} / ${m.qty}`)),
        h('div', { class: c.luma >= r.fee ? 'good' : 'bad' }, `Fee: ${r.fee} Luma`),
        h('div', { class: 'row', style: 'margin-top:6px' }, stoneSel, crumbSel),
        h('div', { style: 'margin-top:6px;font-weight:bold' }, `Success chance: ${chance}%`),
        h('div', { class: 'muted', style: 'font-size:11px' }, '50% + Job Lv×0.2 + DEX×0.1 + LUK×0.1 + forge bonus 20%; −20/−30% for Lv 2/3 weapons, −20% with an element, −15% per star crumb.'),
        check.ok ? null : h('div', { class: 'bad' }, check.error)),
    ], [
      ['Forge', () => { if (!check.ok) return; const res = w.forge(choice); if (res.ok) this.app.hud?.banner(res.success ? 'Forged!' : 'Forging failed', res.message!); this.forgeDialog(recipeId, stone, crumbs); }],
      ['Back', () => this.forgeDialog()],
    ], true);
  }

  /** Pick an unequipped item with a free slot of the right type, confirm, compound (permanent). */
  private compoundDialog(card: ItemInstance) {
    const w = this.app.world!, d = w.data, cardDef = d.items.get(card.itemId)!;
    const targets = compoundTargets(d, w.char, card.itemId);
    const rows = targets.map((t) => {
      const def = d.items.get(t.itemId)!;
      return h('button', { class: 'btn small', style: 'display:block;width:100%;margin:3px 0;text-align:left', onclick: () => {
        this.closeModal();
        this.confirmAction('Compound card', `Compound ${cardDef.name} into ${itemDisplayName(def, t)}? This is permanent: the card cannot be removed, and it is lost if the item is ever destroyed.`, 'Compound', () => w.compound(card.uid, t.uid));
      } }, itemDisplayName(def, t));
    });
    this.modal(`Compound ${cardDef.name}`, [
      h('p', {}, `${modsText(cardDef.card!.mods).join(', ')} — fits ${cardDef.card!.equip} equipment.`),
      ...(rows.length ? rows : [h('p', { class: 'muted' }, `No unequipped ${cardDef.card!.equip} with a free card slot in your bag. Unequip the item first.`)]),
    ], [['Close', () => this.closeModal()]], true);
  }

  // ---------------------------------------------------------------- inventory
  private renderInventory() {
    const w = this.app.world!;
    const body = this.wins.get('inventory')!.body;
    const filters: [typeof this.invFilter, string][] = [['all', 'All'], ['equipment', 'Equip'], ['consumable', 'Use'], ['material', 'Material'], ['card', 'Card'], ['quest', 'Quest']];
    const items = filterInventory(w.data, w.char, this.invFilter);
    const slots = w.data.balance.economy.inventorySlots;
    const grid = h('div', { class: 'inv-grid' });
    for (let i = 0; i < slots; i++) {
      const inst = items[i];
      const el = h('div', { class: 'islot' });
      if (inst) {
        const def = w.data.items.get(inst.itemId)!;
        el.draggable = true;
        el.style.borderColor = def.rarity !== 'common' ? RARITY_COLOR[def.rarity] + '88' : '';
        el.append(h('img', { src: itemIconUrl(def) }), inst.qty > 1 ? h('span', { class: 'q' }, String(inst.qty)) : '', inst.locked ? h('span', { class: 'lock' }, '🔒') : '');
        el.addEventListener('dragstart', (e) => { setDragData(e, { type: 'inv', id: inst.uid }); this.hideTooltip(); });
        el.addEventListener('dblclick', () => { this.closeContext(); this.useOrEquip(inst); });
        el.addEventListener('mousemove', (e) => this.showTooltip(e, this.itemTooltip(def, inst)));
        el.addEventListener('mouseleave', () => this.hideTooltip());
        // A click (left or right) opens the item's actions; Equip / Use comes first as a big button.
        const openActions = (e: MouseEvent) => {
          e.preventDefault();
          this.hideTooltip();
          const actions: [string, () => void][] = [];
          if (def.type === 'consumable') actions.push(['Use', () => this.useOrEquip(inst)]);
          if (def.type === 'equipment') actions.push(['Equip', () => this.useOrEquip(inst)]);
          if (def.type === 'consumable') actions.push(['Add to hotbar', () => this.app.assignHotbar(-1, { type: 'item', id: def.id })]);
          if (def.card) actions.push(['Compound into…', () => this.compoundDialog(inst)]);
          if (this.shopId) actions.push(['Sell', () => this.sellPrompt(inst)]);
          if (this.isOpen('storage')) actions.push(['Store', () => this.qtyPrompt(inst, 'Store how many?', (n) => w.deposit(inst.uid, n))]);
          actions.push([inst.locked ? 'Unlock' : 'Lock', () => w.lock(inst.uid)]);
          actions.push(['Drop', () => this.qtyPrompt(inst, 'Drop how many?', (n) => w.dropItem(inst.uid, n))]);
          this.openContext(e, actions, ['Equip', 'Use'].includes(actions[0]?.[0]) ? def.name : undefined);
        };
        el.addEventListener('click', openActions);
        el.addEventListener('contextmenu', openActions);
      }
      grid.appendChild(el);
    }
    // Drop items from equipment back into the bag.
    grid.addEventListener('dragover', (e) => e.preventDefault());
    grid.addEventListener('drop', (e) => {
      const d = getDragData(e);
      if (d?.type === 'equip') { e.preventDefault(); w.unequip(d.id as EquipSlot); }
    });
    const weight = inventoryWeight(w.data, w.char);
    setChildren(body,
      h('div', { class: 'filters' },
        filters.map(([f, label]) => h('span', { class: `choice${this.invFilter === f ? ' on' : ''}`, onclick: () => { this.invFilter = f; this.renderInventory(); } }, label)),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small', onclick: () => w.sort('type') }, 'Sort: Type'),
        h('button', { class: 'btn small', onclick: () => w.sort('name') }, 'Name'),
        h('button', { class: 'btn small', onclick: () => w.sort('rarity') }, 'Rarity')),
      grid,
      h('div', { class: 'row', style: 'margin-top:8px;font-size:12px' },
        h('span', {}, `Slots ${w.char.inventory.length}/${slots}`),
        h('span', { class: weight > w.weightLimit * 0.7 ? 'bad' : 'muted' }, `Weight ${weight} / ${w.weightLimit}${weight > w.weightLimit * 0.7 ? ' (no regen)' : ''}`),
        h('span', { class: 'spacer' }),
        h('span', { class: 'gold' }, `${w.char.luma.toLocaleString()} Luma`)),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:4px' }, 'Click an item for Equip / Use and more · Double-click to use or equip · Drag to the hotbar or equipment'),
    );
  }

  private useOrEquip(inst: ItemInstance) {
    const w = this.app.world!;
    const def = w.data.items.get(inst.itemId)!;
    if (def.type === 'equipment') w.equip(inst.uid); else w.useItem(inst.uid);
  }

  private qtyPrompt(inst: ItemInstance, msg: string, fn: (n: number) => void) {
    if (inst.qty === 1) { fn(1); return; }
    this.askNumber(msg, inst.qty, fn);
  }

  /** In-game number input dialog (browser prompt() is not used). */
  askNumber(title: string, max: number, onOk: (n: number) => void) {
    const input = h('input', { class: 'text-input', id: 'qty-input', type: 'number', min: 1, max, value: max, style: 'width:120px;text-align:center' });
    const err = h('div', { class: 'error-text' });
    const submit = () => {
      const n = Math.floor(Number(input.value));
      if (!(n >= 1 && n <= max)) { err.textContent = `Enter a number from 1 to ${max}.`; return; }
      this.closeModal();
      onOk(n);
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); if (e.key === 'Escape') this.closeModal(); });
    this.modal(title, [h('div', { class: 'muted' }, `1 – ${max}`), input, err], [['OK', submit], ['Cancel', () => this.closeModal()]], true);
    setTimeout(() => { input.focus(); input.select(); }, 0);
  }

  /** In-game confirmation dialog (browser confirm() is not used). */
  confirmAction(title: string, text: string, okLabel: string, onOk: () => void) {
    this.modal(title, [h('p', {}, text)], [[okLabel, () => { this.closeModal(); onOk(); }], ['Cancel', () => this.closeModal()]], true);
  }

  /** Confirmation that requires typing an exact word (e.g. a character name before deletion). */
  confirmTyped(title: string, text: string, expected: string, okLabel: string, onOk: () => void) {
    const input = h('input', { class: 'text-input', id: 'confirm-input', placeholder: expected, style: 'margin-top:6px' });
    const btnRow: [string, () => void][] = [[okLabel, () => { if (input.value.trim() === expected) { this.closeModal(); onOk(); } else { input.style.borderColor = 'var(--bad)'; } }], ['Cancel', () => this.closeModal()]];
    input.addEventListener('keydown', (e) => e.stopPropagation());
    this.modal(title, [h('p', {}, text), input], btnRow, true);
    setTimeout(() => input.focus(), 0);
  }

  private sellPrompt(inst: ItemInstance) {
    const w = this.app.world!;
    this.qtyPrompt(inst, 'Sell how many?', (n) => w.sell(inst.uid, n));
  }

  // ---------------------------------------------------------------- equipment
  private renderEquipment() {
    const w = this.app.world!;
    const body = this.wins.get('equipment')!.body;
    const slotEl = (slot: EquipSlot) => {
      const inst = w.char.equipment[slot];
      const def = inst ? w.data.items.get(inst.itemId)! : null;
      const el = h('div', { class: 'eslot', title: slot }, def ? h('img', { src: itemIconUrl(def) }) : null, h('span', { class: 'lbl' }, slot.replace('accessory', 'acc ')));
      if (def && inst) {
        el.draggable = true;
        el.addEventListener('dragstart', (e) => setDragData(e, { type: 'equip', id: slot }));
        el.addEventListener('dblclick', () => w.unequip(slot));
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); w.unequip(slot); });
        el.addEventListener('mousemove', (e) => this.showTooltip(e, this.itemTooltip(def, inst)));
        el.addEventListener('mouseleave', () => this.hideTooltip());
      }
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
      el.addEventListener('dragleave', () => el.classList.remove('over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault(); el.classList.remove('over');
        const d = getDragData(e);
        if (d?.type === 'inv') w.equip(d.id, slot);
      });
      return el;
    };
    const prev = new SpritePreview(120, 160, 'equip-preview');
    prev.setLook(lookForCharacter(w.data, w.char));
    setChildren(body,
      h('div', { class: 'equip-layout' },
        slotEl('headgear'), prev.canvas, slotEl('accessory1'),
        slotEl('armor'), slotEl('accessory2'),
        slotEl('weapon'), slotEl('shield'),
        slotEl('garment'), slotEl('boots')),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:8px;text-align:center' }, 'Drag items here · Double-click a slot to unequip'),
      h('table', { class: 'stat-table', style: 'margin-top:6px' },
        h('tr', {}, h('td', {}, 'ATK'), h('td', { class: 'v' }, String(w.stats.patk)), h('td', {}, 'DEF'), h('td', { class: 'v' }, String(w.stats.pdef))),
        h('tr', {}, h('td', {}, 'MATK'), h('td', { class: 'v' }, String(w.stats.matk)), h('td', {}, 'MDEF'), h('td', { class: 'v' }, String(w.stats.mdef)))),
    );
    void EQUIP_SLOTS;
  }

  // ---------------------------------------------------------------- status
  private renderStatus() {
    const w = this.app.world!;
    const c = w.char, s = w.stats;
    const cls = w.data.classes.get(c.classId)!;
    const body = this.wins.get('status')!.body;
    const statRow = (k: StatKey) => {
      const bonus = s.totalStats[k] - c.stats[k];
      return h('tr', {},
        h('td', {}, k.toUpperCase()),
        h('td', { class: 'v' }, String(c.stats[k]), bonus ? h('span', { class: bonus > 0 ? 'good' : 'bad' }, ` ${bonus > 0 ? '+' : ''}${bonus}`) : ''),
        h('td', {}, h('button', {
          class: 'btn small', id: `alloc-${k}`, title: `Costs ${statRaiseCost(w.data, c.stats[k])} point(s). Shift-click: up to 10.`, disabled: !canRaiseStat(w.data, c, k),
          onclick: (e: MouseEvent) => {
            // Raise as many times as affordable (Ragnarok cost grows every 10 points).
            let n = 0, left = c.statPoints;
            while (n < (e.shiftKey ? 10 : 1) && left >= statRaiseCost(w.data, c.stats[k] + n)) { left -= statRaiseCost(w.data, c.stats[k] + n); n++; }
            if (n) w.allocate(k, n);
          },
        }, '+')),
        h('td', { class: 'muted', style: 'font-size:10px' }, `${statRaiseCost(w.data, c.stats[k])}pt`));
    };
    const d = (label: string, v: string | number) => h('tr', {}, h('td', {}, label), h('td', { class: 'v' }, String(v)));
    setChildren(body,
      h('div', { class: 'row', style: 'margin-bottom:8px' },
        h('div', {}, h('div', { style: 'font-size:16px;font-weight:bold' }, c.name), h('div', { class: 'muted' }, `${cls.name} — ${cls.role}`))),
      h('div', { class: 'row', style: 'align-items:flex-start;gap:16px' },
        h('table', { class: 'stat-table', style: 'width:150px' }, STAT_KEYS.map(statRow),
          h('tr', {}, h('td', { class: 'gold' }, 'Points'), h('td', { class: 'v gold' }, String(c.statPoints)), h('td', {}))),
        h('table', { class: 'stat-table', style: 'width:200px' },
          d('HP', `${c.hp} / ${s.maxHp}`), d('MP', `${c.mp} / ${s.maxMp}`), d('ATK', s.patk), d('MATK', s.matk), d('DEF', s.pdef), d('MDEF', s.mdef),
          d('HIT', s.hit), d('FLEE', s.flee), d('CRIT', `${s.crit.toFixed(1)}%`), d('Crit DMG', `${s.critDmg}%`),
          d('ASPD', `${s.aspd} (${(1000 / s.attackIntervalMs).toFixed(2)}/s)`), d('Move Speed', Math.round(s.moveSpeed)),
          d('Cast Time', `${Math.round(s.castTimeMul * 100)}%`), d('Cooldown -', `${s.cdrPct}%`), d('Range', s.attackRange))),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:8px' },
        `Base Lv ${c.baseLevel} (${c.baseExp}/${expToNextBase(w.data, c.baseLevel)}) · Job Lv ${c.jobLevel}/${cls.maxJobLevel} (${c.jobExp}/${expToNextJob(w.data, c.jobLevel)})`),
      h('div', { class: 'muted', style: 'font-size:11px' }, 'STR: ATK & weight · AGI: attack speed & FLEE · VIT: HP & DEF · INT: MATK & MP · DEX: HIT & cast speed · LUK: CRIT. Shift-click + adds 10.'),
      h('div', { class: 'muted', style: 'font-size:11px' }, `Kills ${c.stats_meta.kills} · Deaths ${c.stats_meta.deaths} · Played ${Math.floor(c.stats_meta.playTimeMs / 60000)} min`),
      w.canMount && c.flags.mountOwned ? h('button', { class: 'btn small', id: 'mount-toggle', style: 'margin-top:6px', onclick: () => { w.toggleMount(); this.renderStatus(); } }, c.flags.mounted ? 'Dismount war-drake' : 'Mount war-drake') : '',
    );
  }

  // ---------------------------------------------------------------- skills
  private renderSkills() {
    const w = this.app.world!;
    const c = w.char;
    const body = this.wins.get('skills')!.body;
    const lineage = classLineage(w.data, c.classId);
    const sections = lineage.map((clsId) => {
      const cls = w.data.classes.get(clsId)!;
      return h('div', {},
        h('div', { class: 'gold', style: 'margin:8px 0 2px;font-weight:bold' }, `${cls.name} Skills`),
        cls.skills.map((sid) => {
          const sk = w.data.skills.get(sid)!;
          const lvl = c.skills[sid] ?? 0;
          const chk = skillCheck(w.data, c, sk);
          const reqs = [
            ...(sk.requires ?? []).map((r) => `${w.data.skills.get(r.skillId)?.name} Lv.${r.level}`),
            sk.requiresJobLevel ? `Job Lv.${sk.requiresJobLevel}` : '',
            sk.requiresWeapon ? `${sk.requiresWeapon.join('/')}` : '',
          ].filter(Boolean);
          const img = h('img', { src: skillIconUrl(sk), draggable: lvl > 0 && sk.kind !== 'passive', title: lvl > 0 ? 'Drag to the hotbar' : '' });
          img.addEventListener('dragstart', (e) => setDragData(e, { type: 'skill', id: sid }));
          img.addEventListener('dblclick', () => { if (lvl > 0 && sk.kind !== 'passive') this.app.assignHotbar(-1, { type: 'skill', id: sid }); });
          const mp = sk.kind === 'passive' ? '' : ` · MP ${w.skillMpCost(sk, Math.max(1, lvl))}`;
          const timing = sk.kind === 'passive' ? 'Passive' : `${sk.castTimeMs ? `Cast ${(sk.castTimeMs / 1000).toFixed(1)}s · ` : ''}CD ${(sk.cooldownMs / 1000).toFixed(1)}s${mp}`;
          return h('div', { class: `skill${lvl === 0 ? ' locked' : ''}` },
            img,
            h('div', {},
              h('div', { class: 'sn' }, sk.name, h('span', { class: 'muted', style: 'font-weight:normal' }, `  Lv ${lvl}/${sk.maxLevel}  · ${sk.kind}`)),
              h('div', { class: 'sd' }, sk.description),
              h('div', { class: 'sd' }, timing),
              reqs.length ? h('div', { class: 'req' }, `Requires: ${reqs.join(', ')}`) : null),
            h('button', { class: 'btn small', disabled: !chk.ok, title: chk.ok ? 'Learn / level up' : chk.error, onclick: () => w.learn(sid) }, '+'));
        }));
    });
    setChildren(body,
      h('div', { class: 'row' }, h('span', { class: 'gold' }, `Skill Points: ${c.skillPoints}`), h('span', { class: 'spacer' }),
        h('span', { class: 'muted', style: 'font-size:11px' }, 'Drag learned skills onto the hotbar')),
      h('div', { style: 'width:470px' }, sections));
  }

  // ---------------------------------------------------------------- quests
  private renderQuests() {
    const w = this.app.world!;
    const body = this.wins.get('quests')!.body;
    const active = activeQuests(w.data, w.char);
    const done = Object.values(w.char.quests).filter((p) => p.status === 'completed').map((p) => w.data.quests.get(p.questId)!).filter(Boolean);
    if (!this.selectedQuest && active[0]) this.selectedQuest = active[0].def.id;
    const sel = this.selectedQuest ? w.data.quests.get(this.selectedQuest) : null;
    const prog = sel ? w.char.quests[sel.id] : null;
    const item = (q: QuestDef) => h('div', { class: `qi${q.id === this.selectedQuest ? ' on' : ''}`, onclick: () => { this.selectedQuest = q.id; this.renderQuests(); } },
      h('span', { class: `tag ${q.category}` }, q.category), q.name, w.char.quests[q.id]?.status === 'ready' ? ' ✔' : '');
    setChildren(body,
      h('div', { style: 'display:grid;grid-template-columns:220px 320px;gap:12px' },
        h('div', { class: 'quest-list' },
          h('div', { class: 'gold', style: 'font-weight:bold' }, `Active (${active.length})`),
          active.map((a) => item(a.def)),
          h('div', { class: 'gold', style: 'font-weight:bold;margin-top:8px' }, `Completed (${done.length})`),
          done.map(item)),
        sel ? h('div', {},
          h('div', { style: 'font-size:15px;font-weight:bold' }, sel.name),
          h('div', { class: 'muted', style: 'margin:4px 0 8px' }, sel.summary),
          h('div', { class: 'gold' }, 'Objectives'),
          sel.objectives.map((o, i) => {
            const n = objectiveTarget(o), cnt = prog?.counts[i] ?? 0;
            return h('div', { class: prog?.status === 'completed' || cnt >= n ? 'good' : '' }, `• ${o.label}${n > 1 ? ` (${Math.min(cnt, n)}/${n})` : ''}`);
          }),
          h('div', { class: 'muted', style: 'margin-top:6px' }, `Given by ${w.data.npcs.get(sel.giverNpc)?.name} · Turn in to ${w.data.npcs.get(sel.turnInNpc)?.name}`),
          h('div', { class: 'gold', style: 'margin-top:8px' }, 'Rewards'),
          h('div', { style: 'font-size:12px' }, rewardText(this.app, sel)),
          prog && prog.status !== 'completed' && sel.category !== 'main'
            ? h('button', { class: 'btn small danger', style: 'margin-top:10px', onclick: () => { w.abandon(sel.id); this.selectedQuest = null; this.renderQuests(); } }, 'Abandon') : null,
        ) : h('div', { class: 'muted' }, 'No quest selected.')));
  }

  // ---------------------------------------------------------------- world map
  private renderWorldMap() {
    const w = this.app.world!;
    const body = this.wins.get('worldMap')!.body;
    const box = h('div', { class: 'worldmap' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const MW = 760, MH = 460;
    svg.setAttribute('width', String(MW)); svg.setAttribute('height', String(MH));
    svg.style.position = 'absolute'; svg.style.inset = '0';
    for (const m of w.data.maps.values()) for (const p of m.portals) {
      const t = w.data.maps.get(p.targetMap)!;
      if (m.type === 'instance' || t.type === 'instance' || m.type === 'arena' || t.type === 'arena') continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(m.worldMapPos.x * MW)); line.setAttribute('y1', String(m.worldMapPos.y * MH));
      line.setAttribute('x2', String(t.worldMapPos.x * MW)); line.setAttribute('y2', String(t.worldMapPos.y * MH));
      line.setAttribute('stroke', '#c8a26b'); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-dasharray', '5 4'); line.setAttribute('opacity', '0.7');
      svg.appendChild(line);
    }
    box.appendChild(svg);
    for (const m of w.data.maps.values()) {
      if (m.type === 'instance' || m.type === 'arena') continue;
      const here = m.id === w.map.def.id;
      const col = m.type === 'town' ? '#ffd34d' : m.type === 'field' ? '#6fe08a' : '#ff6a5a';
      const node = h('div', { class: `wm-node ${m.type}${here ? ' here' : ''}`, title: `${m.name} — ${m.region}${m.levelRange ? ` (Lv.${m.levelRange[0]}–${m.levelRange[1]})` : ''}`, style: { left: `${m.worldMapPos.x * MW}px`, top: `${m.worldMapPos.y * MH}px` } },
        h('div', { class: 'dot', style: { background: col } }),
        w.event && !w.event.done && w.event.mapId === m.id ? h('div', { style: 'position:absolute;left:10px;top:-14px;font-size:13px', title: 'Raid in progress' }, '⚔') : '',
        h('div', { class: 'wm-name' }, m.type === 'town' ? m.name.replace(/^(Royal Capital|Tower City|Desert City|Port Town|Snow Town) /, '').replace(/ Village$/, '') : m.name),
        m.levelRange ? h('div', { class: 'muted' }, `Lv.${m.levelRange[0]}–${m.levelRange[1]}`) : null);
      box.appendChild(node);
    }
    setChildren(body, box, h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px;display:flex;gap:14px' },
      h('span', {}, h('b', { style: 'color:#ffd34d' }, '●'), ' Town'), h('span', {}, h('b', { style: 'color:#6fe08a' }, '●'), ' Field'), h('span', {}, h('b', { style: 'color:#ff6a5a' }, '●'), ' Dungeon'),
      h('span', {}, `You are in ${w.map.def.name} — ${w.map.def.region}. Hover a place for details; Courier Guild NPCs warp between towns.`)));
  }

  // ---------------------------------------------------------------- settings
  private renderSettings() {
    const app = this.app;
    const st = app.settings;
    const body = this.wins.get('settings')!.body;
    const slider = (key: keyof typeof st.volume, label: string) => {
      const val = h('span', {}, `${Math.round(st.volume[key] * 100)}`);
      const input = h('input', { type: 'range', min: 0, max: 100, value: Math.round(st.volume[key] * 100) });
      input.addEventListener('input', () => { st.volume[key] = Number(input.value) / 100; val.textContent = input.value; app.applySettings(); });
      return h('div', { class: 'range-row' }, h('span', {}, label), input, val);
    };
    const toggle = (key: 'showDamageNumbers' | 'autoLoot' | 'showCollision' | 'wasdMovement' | 'cellCursor' | 'showGrid' | 'effects' | 'touchControls', label: string) => {
      const cb = h('input', { type: 'checkbox', id: `set-${key}`, checked: key === 'cellCursor' ? st[key] !== false : key === 'touchControls' ? (st[key] ?? isTouchDevice()) : !!st[key] });
      cb.addEventListener('change', () => { st[key] = cb.checked; app.applySettings(); });
      return h('label', { class: 'row', style: 'margin-bottom:4px' }, cb, label);
    };
    const binds = Object.keys(DEFAULT_KEYBINDS).map((action) => {
      const btn = h('button', { class: `btn small${this.listening === action ? ' listening' : ''}` }, this.listening === action ? 'Press a key…' : app.keyLabel(action));
      btn.addEventListener('click', () => { this.listening = action; this.renderSettings(); });
      return h('div', { class: 'keybind' }, h('span', {}, action), btn);
    });
    const langSel = h('select', { id: 'set-language', 'data-noi18n': true }, LANGS.map((l) => h('option', { value: l.id }, l.label)));
    langSel.value = getLang();
    langSel.addEventListener('change', () => app.setLanguage(langSel.value as Lang));
    setChildren(body,
      h('div', { style: 'width:380px' },
        h('div', { class: 'row', style: 'margin-bottom:8px;gap:8px' }, h('span', { class: 'gold', style: 'font-weight:bold' }, 'Language'), langSel),
        h('div', { class: 'gold', style: 'font-weight:bold' }, 'Audio'),
        slider('master', 'Master'), slider('music', 'Music'), slider('sfx', 'SFX'), slider('ambient', 'Ambient'),
        h('div', { class: 'gold', style: 'font-weight:bold;margin-top:8px' }, 'Gameplay'),
        toggle('showDamageNumbers', 'Show damage numbers'), toggle('autoLoot', 'Auto-loot drops'), toggle('wasdMovement', 'WASD movement'),
        toggle('effects', 'Visual effects (skills, hits, particles, weather) — applies on the next map'),
        toggle('cellCursor', 'Cell cursor under the mouse (Ragnarok style)'),
        toggle('showGrid', 'Show grid lines on the map'),
        toggle('touchControls', 'Touch controls (joystick and buttons for phones / tablets)'),
        toggle('showCollision', 'Show collision / spawn debug overlay'),
        h('div', { class: 'gold', style: 'font-weight:bold;margin-top:8px' }, 'Key Bindings'),
        h('div', { style: 'max-height:180px;overflow:auto;padding-right:6px' }, binds),
        h('button', { class: 'btn small', style: 'margin-top:4px', onclick: () => { st.keybinds = { ...DEFAULT_KEYBINDS }; app.applySettings(); this.renderSettings(); } }, 'Reset key bindings'),
        app.world ? h('div', { class: 'row', style: 'margin-top:12px' },
          h('button', { class: 'btn primary', onclick: () => app.saveNow(true) }, 'Save Game'),
          h('button', { class: 'btn', onclick: () => app.exitToSelect() }, 'Character Select')) : null));
  }

  // ---------------------------------------------------------------- database (monsters / items / cards)
  private db = { tab: 'monsters' as DbTab, q: '', filter: '', sel: '' };
  private dbt = { rk: 'w1' as RefineKind, enriched: false, from: 4, to: 10, jl: 50, dex: 60, luk: 30, wl: 1, stone: false, crumbs: 0, pool: 'weapon' as 'weapon' | 'armor' };

  /** Calculator / reference tabs (refine simulator, forge calculator, option odds, combos, pets, element chart). */
  private renderDbTool(): HTMLElement {
    const w = this.app.world!, d = w.data, st = this.db, t = this.dbt;
    const re = () => this.renderDatabase();
    const num = (id: string, val: number, min: number, max: number, set: (n: number) => void) => {
      const el = h('input', { type: 'number', id, value: val, min, max, style: 'width:64px' }) as HTMLInputElement;
      el.addEventListener('change', () => { set(Math.max(min, Math.min(max, Math.floor(Number(el.value) || 0)))); re(); });
      return el;
    };
    const select = <T extends string>(id: string, val: T, opts: [T, string][], set: (v: T) => void) => {
      const el = h('select', { id }, opts.map(([v, l]) => h('option', { value: v }, l))) as HTMLSelectElement;
      el.value = val; el.addEventListener('change', () => { set(el.value as T); re(); });
      return el;
    };
    const check = (id: string, val: boolean, set: (v: boolean) => void) => {
      const el = h('input', { type: 'checkbox', id }) as HTMLInputElement;
      el.checked = val; el.addEventListener('change', () => { set(el.checked); re(); });
      return el;
    };
    const pct = (x: number) => `${+(x * 100).toFixed(2)}%`;
    const row = (...c: (HTMLElement | string)[]) => h('div', { class: 'row', style: 'gap:8px;margin:4px 0;align-items:center' }, ...c);
    const th = (...c: string[]) => h('tr', {}, c.map((x) => h('th', { style: 'text-align:left;padding-right:10px;color:#c8a26b' }, x)));
    const td = (...c: (string | number)[]) => h('tr', {}, c.map((x) => h('td', { style: 'padding-right:10px' }, String(x))));
    if (st.tab === 'refine') {
      const sim = simulateRefine(t.rk, t.from, t.to, t.enriched);
      const ore = [...new Set(sim.steps.map((s) => d.items.get(refineOre(t.rk, t.enriched && s.level <= 10, s.level))?.name ?? ''))].join(' / ');
      return h('div', { id: 'db-refine' },
        h('div', { class: 'muted' }, 'Refine simulator. Up to +10 a failure above the safe limit destroys the item; from +11 to +20 a failure breaks it 20% of the time and otherwise drops it 3 levels. Totals assume you start again from the "from" level with another copy after a break. Enriched ore only applies up to +10.'),
        row('Equipment', select('dbt-rk', t.rk, [['w1', 'Weapon Lv 1'], ['w2', 'Weapon Lv 2'], ['w3', 'Weapon Lv 3'], ['w4', 'Weapon Lv 4'], ['armor', 'Armor']], (v) => { t.rk = v; }),
          'from +', num('dbt-from', t.from, 0, 19, (n) => { t.from = n; t.to = Math.max(t.to, n + 1); }), 'to +', num('dbt-to', t.to, 1, 20, (n) => { t.to = Math.max(n, t.from + 1); }),
          h('label', {}, check('dbt-enriched', t.enriched, (v) => { t.enriched = v; }), ' enriched ore')),
        h('table', { style: 'margin-top:6px' }, th('Step', 'Chance', 'All in a row'),
          ...sim.steps.map((s, i) => td(`+${s.level - 1} → +${s.level}`, pct(s.chance), pct(sim.steps.slice(0, i + 1).reduce((a, x) => a * x.chance, 1))))),
        h('table', { style: 'margin-top:8px' },
          td('One item survives', pct(sim.survive)),
          td('Expected items used', Number.isFinite(sim.expectedItems) ? sim.expectedItems.toFixed(2) : '∞'),
          td(`Expected ${ore}`, Number.isFinite(sim.expectedOre) ? sim.expectedOre.toFixed(1) : '∞'),
          td('Expected Luma', Number.isFinite(sim.expectedLuma) ? Math.round(sim.expectedLuma).toLocaleString() : '∞'),
          td('Fee per attempt', `${refineFee(t.rk).toLocaleString()} Luma (+11 and up: ${refineFee(t.rk, 11).toLocaleString()})`)));
    }
    if (st.tab === 'forge') {
      const p = forgeChanceRaw({ jobLevel: t.jl, dex: t.dex, luk: t.luk, weaponLevel: t.wl, stone: t.stone, crumbs: t.crumbs });
      const mine = h('button', { class: 'btn small', onclick: () => { Object.assign(t, { jl: w.char.jobLevel, dex: w.char.stats.dex, luk: w.char.stats.luk }); re(); } }, 'Use my stats');
      return h('div', { id: 'db-forge' },
        h('div', { class: 'muted' }, 'Forge calculator: 50 + Job Lv × 0.2 + DEX × 0.1 + LUK × 0.1 + 20 (forge master) − 20 / 30 for weapon Lv 2 / 3 − 20 with an element stone − 15 per star crumb (5%–100%).'),
        row('Job Lv', num('dbt-jl', t.jl, 1, 50, (n) => { t.jl = n; }), 'DEX', num('dbt-dex', t.dex, 1, 130, (n) => { t.dex = n; }), 'LUK', num('dbt-luk', t.luk, 0, 130, (n) => { t.luk = n; }), mine),
        row('Weapon Lv', select('dbt-wl', String(t.wl) as '1' | '2' | '3', [['1', '1'], ['2', '2'], ['3', '3']], (v) => { t.wl = Number(v); }),
          h('label', {}, check('dbt-stone', t.stone, (v) => { t.stone = v; }), ' element stone'), 'Star crumbs', num('dbt-crumbs', t.crumbs, 0, 3, (n) => { t.crumbs = n; })),
        h('div', { id: 'dbt-forge-result', style: 'font-size:22px;margin-top:10px;color:#ffd34d' }, `Success: ${pct(p)}`),
        h('div', { class: 'muted' }, `Recipes: ${[...d.recipes.values()].filter((r) => (d.items.get(r.itemId)?.weaponLevel ?? 1) === t.wl).map((r) => d.items.get(r.itemId)!.name).join(', ') || '—'}`));
    }
    if (st.tab === 'options') {
      return h('div', { id: 'db-options' },
        h('div', { class: 'muted' }, `Random options on dropped gear: 0 / 1 / 2 / 3 options at ${DROP_OPTION_COUNT.map((x) => `${Math.round(x * 100)}%`).join(' / ')}. Each roll picks from this pool (no duplicates on one item). The enchanter adds one (${ENCHANT_COST.toLocaleString()} Luma) or rerolls all (${REROLL_COST.toLocaleString()}).`),
        row('Pool', select('dbt-pool', t.pool, [['weapon', 'Weapons'], ['armor', 'Armor & accessories']], (v) => { t.pool = v; })),
        h('div', { style: 'max-height:300px;overflow:auto' }, h('table', {}, th('Option', 'Range', 'Chance per roll'),
          ...optionOdds(t.pool).map((o) => td(o.def.label.replace('{v}', 'X'), `${o.def.min}–${o.def.max}`, `${o.pct.toFixed(2)}%`)))));
    }
    if (st.tab === 'combos') {
      return h('div', { id: 'db-combos', style: 'max-height:370px;overflow:auto' }, h('table', {}, th('Combo', 'Parts', 'Bonus'),
        ...[...d.combos.values()].map((cb) => td(cb.name, cb.parts.map((p) => d.items.get(p)?.name ?? p).join(' + '), modsText(cb.mods).join(', ')))));
    }
    if (st.tab === 'pets') {
      return h('div', { id: 'db-pets', style: 'max-height:370px;overflow:auto' },
        h('div', { class: 'muted' }, 'Capture chance = (rate + (your Base Lv − monster Lv) × 30 + LUK × 20) × (200 − monster HP%) / 100, in hundredths of a percent.'),
        h('table', {}, th('Pet', 'Lv', 'Base rate', 'Food', 'Loyal bonus'),
          ...[...d.pets.values()].map((p) => td(p.name, d.monsters.get(p.monsterId)!.level, `${p.captureRate / 100}%`, d.items.get(p.foodItem)!.name, p.loyalText))));
    }
    // elements
    const lv = String(Math.max(1, Math.min(4, Number(st.filter) || 1)));
    const tbl = d.elementTables[lv];
    const order = Object.keys(tbl) as (keyof typeof tbl)[];
    const color = (v: number) => (v >= 150 ? '#6fe08a' : v > 100 ? '#b8f0a0' : v === 100 ? '#e8e0d0' : v > 0 ? '#ffb070' : '#ff6a5a');
    return h('div', { id: 'db-elements' },
      row('Defender element level', select('dbt-ellv', lv as '1' | '2' | '3' | '4', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], (v) => { st.filter = v; })),
      h('div', { class: 'muted', style: 'font-size:11px' }, 'Rows: attack element. Columns: defender element. Damage in %; negative heals the target.'),
      h('table', { style: 'font-size:11px;margin-top:4px' }, h('tr', {}, h('th', {}, ''), order.map((e) => h('th', { style: 'padding:2px 4px;color:#c8a26b' }, e.slice(0, 4)))),
        ...order.map((a) => h('tr', {}, h('th', { style: 'text-align:left;padding-right:6px;color:#c8a26b' }, a), order.map((dd) => h('td', { style: `padding:2px 4px;text-align:right;color:${color(tbl[a][dd])}` }, String(tbl[a][dd])))))));
  }
  // ---------------------------------------------------------------- pet
  private renderPet() {
    const w = this.app.world!, d = w.data, c = w.char, body = this.wins.get('pet')!.body;
    const bar = (v: number, max: number, col: string) => h('div', { style: 'height:8px;background:#2a2433;border-radius:4px;overflow:hidden;width:180px' },
      h('div', { style: `height:100%;width:${Math.round((v / max) * 100)}%;background:${col}` }));
    const pet = c.pet;
    if (!pet) {
      const eggs = c.inventory.filter((i) => d.items.get(i.itemId)?.petEgg);
      setChildren(body, h('div', { style: 'width:300px' },
        h('div', { class: 'muted' }, 'You have no pet out.'),
        eggs.length ? h('div', { style: 'margin-top:6px' }, eggs.map((e) => h('div', { class: 'row', style: 'margin:3px 0' },
          h('span', {}, `${d.items.get(e.itemId)!.name}${e.pet ? ` — ${e.pet.name} (${intimacyLabel(e.pet.intimacy)})` : ''}`), h('span', { class: 'spacer' }),
          h('button', { class: 'btn small', id: `pet-hatch-${e.uid}`, onclick: () => { w.hatchPet(e.uid); this.renderPet(); } }, 'Hatch'))))
          : h('div', { class: 'muted', style: 'margin-top:6px;font-size:11px' },
            `How to tame: buy a monster's lure from the Pet Keeper in Fernhollow, weaken that monster, target it and use the lure. Tameable: ${[...d.pets.values()].map((p) => p.name).join(', ')}.`)));
      return;
    }
    const pd = d.pets.get(pet.petId)!;
    const food = d.items.get(pd.foodItem)!;
    const loyal = pet.intimacy >= LOYAL_AT;
    const name = h('input', { type: 'text', value: pet.name, maxlength: 16, style: 'width:120px', id: 'pet-name' }) as HTMLInputElement;
    setChildren(body, h('div', { style: 'width:300px' },
      h('div', { style: 'font-size:15px;font-weight:bold;color:#ffd8f0' }, `${pet.name}`, h('span', { class: 'muted', style: 'font-weight:normal;font-size:11px' }, `  ${pd.name}`)),
      h('div', { style: 'margin-top:6px' }, `Hunger: ${hungerLabel(pet.hunger)} (${pet.hunger}/100)`), bar(pet.hunger, 100, pet.hunger <= 25 ? '#e0a040' : '#6fe08a'),
      h('div', { style: 'margin-top:6px' }, `Intimacy: ${intimacyLabel(pet.intimacy)} (${pet.intimacy}/1000)`), bar(pet.intimacy, 1000, '#ff7aa8'),
      h('div', { style: 'margin-top:6px', class: loyal ? 'good' : 'muted' }, `Loyal bonus: ${pd.loyalText}${loyal ? ' (active)' : ' (inactive until Loyal)'}`),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, `Food: ${food.name} (you have ${countItem(c, food.id)}). Feed it when Hungry or Neutral; feeding when Stuffed lowers intimacy, and so does starving or dying.`),
      h('div', { class: 'row', style: 'margin-top:8px;gap:6px' },
        h('button', { class: 'btn small', id: 'pet-feed', onclick: () => { w.feedPetCmd(); this.renderPet(); } }, `Feed ${food.name}`),
        h('button', { class: 'btn small', id: 'pet-egg', onclick: () => { w.petToEgg(); this.renderPet(); } }, 'Return to egg')),
      h('div', { class: 'row', style: 'margin-top:6px;gap:6px' }, name, h('button', { class: 'btn small', onclick: () => { w.renamePetCmd(name.value); this.renderPet(); } }, 'Rename')),
      h('div', { style: 'margin-top:8px' }, `Accessory: ${pet.accessory ? d.items.get(pet.accessory)!.name : 'none'}${pd.accessoryItem ? ` (${d.items.get(pd.accessoryItem)!.name}: +1 all stats while Cordial+)` : ''}`),
      h('div', { class: 'row', style: 'margin-top:4px;gap:6px' },
        pet.accessory ? h('button', { class: 'btn small', onclick: () => { w.petAccessoryCmd(); this.renderPet(); } }, 'Remove accessory')
          : c.inventory.find((i) => i.itemId === pd.accessoryItem) ? h('button', { class: 'btn small', id: 'pet-acc', onclick: () => { w.petAccessoryCmd(c.inventory.find((i) => i.itemId === pd.accessoryItem)!.uid); this.renderPet(); } }, 'Put on accessory') : '',
        pd.evolution && !pet.evolved ? h('button', { class: 'btn small', id: 'pet-evolve', title: `Needs Loyal + ${pd.evolution.materials.map((m) => `${m.qty}× ${d.items.get(m.itemId)?.name}`).join(', ')}`, onclick: () => { w.evolvePetCmd(); this.renderPet(); } }, `Evolve → ${pd.evolution.name}`) : ''),
      pd.evolution && !pet.evolved ? h('div', { class: 'muted', style: 'font-size:11px' }, `Evolution needs Loyal and ${pd.evolution.materials.map((m) => `${m.qty}× ${d.items.get(m.itemId)?.name}`).join(', ')}. Loyal bonus becomes 50% stronger.`) : pet.evolved ? h('div', { class: 'good', style: 'font-size:11px' }, 'Evolved: Loyal bonus ×1.5') : ''));
  }

  // ---------------------------------------------------------------- homunculus
  private renderHomun() {
    const w = this.app.world!, d = w.data, c = w.char, body = this.wins.get('homun')!.body;
    const hm = c.homunculus;
    if (!hm) {
      setChildren(body, h('div', { style: 'width:300px' }, h('div', { class: 'muted' }, 'You have no homunculus.'),
        h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, 'Alchemists who learn Bioethics can use a Homunculus Embryo (Alchemy Supplies in Tidewatch) to create one: Sylph (healer), Golemite (tank), Fawnling (striker) or Gloom (caster), chosen at random.'),
        c.inventory.some((i) => i.itemId === 'homun_embryo') ? h('button', { class: 'btn small', style: 'margin-top:6px', onclick: () => { w.createHomunCmd(); this.renderHomun(); } }, 'Use embryo') : ''));
      return;
    }
    const hd = d.homunculi.get(hm.typeId)!, st = homunStats(d, hm);
    const bar = (v: number, max: number, col: string) => h('div', { style: 'height:8px;background:#2a2433;border-radius:4px;overflow:hidden;width:200px' }, h('div', { style: `height:100%;width:${Math.round((v / max) * 100)}%;background:${col}` }));
    setChildren(body, h('div', { style: 'width:320px' },
      h('div', { style: 'font-size:15px;font-weight:bold;color:#d8c8ff' }, `${hm.name}`, h('span', { class: 'muted', style: 'font-size:11px;font-weight:normal' }, `  ${hd.role} · Lv ${hm.level}${hm.evolved ? ' · Evolved' : ''}`)),
      h('div', { style: 'margin-top:6px' }, `HP ${Math.round(hm.hp)} / ${st.maxHp}${hm.alive ? '' : ' (fallen)'}`), bar(hm.hp, st.maxHp, '#9a7aff'),
      h('div', { style: 'margin-top:4px' }, `EXP ${hm.exp} / ${homunExpToNext(hm.level)}`), bar(hm.exp, homunExpToNext(hm.level), '#ffd34d'),
      h('div', { style: 'margin-top:4px' }, `Hunger ${hm.hunger}/100 · Intimacy ${hm.intimacy}/1000 (${intimacyLabel(hm.intimacy)}${hm.intimacy >= 910 ? ', +10% stats' : ''})`),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:4px' }, `ATK ${st.atk} · MATK ${st.matk} · DEF ${st.def} · FLEE ${st.flee} · ${st.magic ? 'casts' : 'melee'} · skill: ${hd.skill.name}`),
      h('div', { class: 'muted', style: 'font-size:11px' }, hd.description),
      h('div', { class: 'row', style: 'margin-top:8px;gap:6px;flex-wrap:wrap' },
        h('button', { class: 'btn small', id: 'homun-call', onclick: () => { w.homunCallRest(); this.renderHomun(); } }, hm.out ? 'Rest' : 'Call'),
        h('button', { class: 'btn small', id: 'homun-feed', onclick: () => { w.homunFeedCmd(); this.renderHomun(); } }, `Feed (${countItem(c, 'homun_ration')})`),
        !hm.alive ? h('button', { class: 'btn small', onclick: () => { w.homunReviveCmd(); this.renderHomun(); } }, `Revive (${countItem(c, 'homun_revive')})`) : '',
        !hm.evolved ? h('button', { class: 'btn small', title: 'Lv 50, Loyal, 1 Stone of Sages', onclick: () => { w.homunEvolveCmd(); this.renderHomun(); } }, 'Evolve') : '')));
  }

  // ---------------------------------------------------------------- auto farm / auto quest
  private renderAuto() {
    const w = this.app.world!, au = w.auto, st = au.settings, body = this.wins.get('auto')!.body;
    const focused = document.activeElement;
    if (focused && body.contains(focused) && focused.tagName === 'INPUT' && (focused as HTMLInputElement).type === 'number') return;
    const num = (id: string, label: string, key: 'radius' | 'hpPotionPct' | 'mpPotionPct', min: number, max: number) => {
      const el = h('input', { type: 'number', id, value: st[key], min, max, style: 'width:64px' }) as HTMLInputElement;
      el.addEventListener('change', () => { st[key] = Math.max(min, Math.min(max, Number(el.value) || min)); au.saveSettings(); this.renderAuto(); });
      return h('div', { class: 'row', style: 'gap:6px;margin:3px 0' }, h('span', { style: 'width:170px' }, label), el);
    };
    const tick = (id: string, label: string, key: 'useSkills' | 'loot' | 'skipElites') => {
      const el = h('input', { type: 'checkbox', id }) as HTMLInputElement;
      el.checked = st[key]; el.addEventListener('change', () => { st[key] = el.checked; au.saveSettings(); });
      return h('label', { style: 'display:block;margin:3px 0' }, el, ` ${label}`);
    };
    const q = au.currentQuest();
    setChildren(body, h('div', { style: 'width:330px' },
      // Settings only: Auto Farm starts with the AUTO button beside the hotbar, Auto Quest from the quest tracker.
      h('div', { class: au.mode === 'off' ? 'muted' : 'good' }, au.mode === 'off' ? 'Stopped.' : `${au.mode === 'farm' ? 'Auto Farm' : 'Auto Quest'}: ${au.status || '…'}`),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:2px' }, q ? `Next quest: ${q.name}` : 'No quests left — Auto Quest has nothing to do.'),
      h('div', { class: 'gold', style: 'margin-top:8px;font-weight:bold' }, 'Auto Farm settings'),
      num('auto-radius', 'Farm radius (px)', 'radius', 150, 2000),
      num('auto-hp', 'Drink HP potion below (%)', 'hpPotionPct', 0, 95),
      num('auto-mp', 'Drink MP potion below (%)', 'mpPotionPct', 0, 95),
      tick('auto-skills', 'Use skills on the hotbar', 'useSkills'),
      tick('auto-loot', 'Pick up loot', 'loot'),
      tick('auto-elites', 'Leave elites and bosses alone (unless they attack)', 'skipElites'),
      // Which monsters to farm: only species that live on this map are listed.
      h('div', { class: 'gold', style: 'margin-top:8px;font-weight:bold' }, `Monsters to farm on ${w.map.def.name}`),
      au.mapSpecies().length
        ? h('div', { id: 'auto-targets', style: 'display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin-top:3px' }, au.mapSpecies().map((id) => {
          const md = w.data.monsters.get(id)!;
          const cb = h('input', { type: 'checkbox', dataset: { mon: id } }) as HTMLInputElement;
          cb.checked = st.targets.includes(id);
          cb.addEventListener('change', () => {
            st.targets = cb.checked ? [...new Set([...st.targets, id])] : st.targets.filter((x) => x !== id);
            au.saveSettings();
            this.renderAuto();
          });
          return h('label', { style: 'font-size:12px' }, cb, ` ${md.name} Lv.${md.level}`);
        }))
        : h('div', { class: 'muted', style: 'font-size:11px' }, 'No monsters live on this map.'),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:2px' }, au.pickedOnMap() ? `Farming only: ${au.pickedOnMap()!.map((id) => w.data.monsters.get(id)!.name).join(', ')} (monsters that attack you are still fought back).` : 'None ticked: every monster here is farmed.'),
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' },
        'Press AUTO beside the hotbar to fight the monsters around you; press it again to stop. Auto Quest starts from the quest list (top right). Both stop when you click, move by hand, die, or carry 90% weight. Put skills on the hotbar for them to be used.')));
  }

  // ---------------------------------------------------------------- Market Trader (hourly market prices + graph)
  private traderPick = '';
  private traderSide: 'sell' | 'buy' = 'sell';
  private pctArrow(pct: number) {
    return h('span', { class: pct > 0.05 ? 'good' : pct < -0.05 ? 'bad' : 'muted' }, `${pct > 0.05 ? '▲' : pct < -0.05 ? '▼' : '■'} ${Math.abs(pct).toFixed(1)}%`);
  }

  private renderTrader() {
    const w = this.app.world!, d = w.data, c = w.char, body = this.wins.get('trader')!.body, now = w.now();
    const focused = document.activeElement;
    if (focused && body.contains(focused) && focused.tagName === 'SELECT') return;
    const sellable = c.inventory.filter((i) => { const def = d.items.get(i.itemId)!; return def.type !== 'quest' && !i.bound && !def.bound && !i.locked; });
    if (!this.traderPick || !d.items.has(this.traderPick)) this.traderPick = sellable[0]?.itemId ?? 'red_potion';
    const chart = (itemId: string, w0: number, h0: number, mini: boolean, side: 'sell' | 'buy' = 'sell') => {
      const cv = h('canvas', { width: w0, height: h0, class: mini ? 'spark' : 'pchart', dataset: { side } }) as HTMLCanvasElement;
      const hist = priceHistory(d, c, itemId, now, 24, side);
      drawPriceChart(cv, hist.map((p, i) => ({ label: i === hist.length - 1 ? 'now' : `-${hist.length - 1 - i}h`, value: p.price })), { mini });
      return cv;
    };
    const arrow = (pct: number) => this.pctArrow(pct);
    const near = w.npcs.some((n) => n.def.services.some((s) => s.type === 'trader') && Math.hypot(n.x - w.player.x, n.y - w.player.y) < 160);
    const rows = sellable.map((inst) => {
      const def = d.items.get(inst.itemId)!, price = traderPrice(d, c, inst.itemId, now), pct = priceChangePct(d, c, inst.itemId, now);
      return h('div', { class: `trow${inst.itemId === this.traderPick ? ' on' : ''}`, dataset: { item: inst.itemId }, onclick: () => { this.traderPick = inst.itemId; this.renderTrader(); } },
        h('img', { src: itemIconUrl(def) }),
        h('span', { class: 'tn' }, `${inst.refine ? `+${inst.refine} ` : ''}${def.name}${inst.qty > 1 ? ` ×${inst.qty}` : ''}`),
        chart(inst.itemId, 60, 18, true),
        h('span', { class: 'tp gold' }, `${price.toLocaleString()}`),
        arrow(pct),
        h('button', { class: 'btn small', disabled: !near, onclick: (e: Event) => { e.stopPropagation(); this.qtyPrompt(inst, 'Sell how many?', (n) => { w.traderSell(inst.uid, n); this.renderTrader(); }); } }, 'Sell'));
    });
    const pickDef = d.items.get(this.traderPick)!;
    const allItems = [...d.items.values()].filter((i) => i.type !== 'quest' && !i.bound).sort((a, b) => a.name.localeCompare(b.name));
    const sel = h('select', { id: 'trader-pick', style: 'max-width:220px' }, allItems.map((i) => h('option', { value: i.id }, i.name))) as HTMLSelectElement;
    sel.value = this.traderPick;
    sel.addEventListener('change', () => { this.traderPick = sel.value; this.renderTrader(); });
    const forSale = [...d.shops.values()].some((sh) => sh.market && shopStock(d, sh, now).includes(this.traderPick));
    if (!forSale) this.traderSide = 'sell';
    const side = this.traderSide;
    const sideBtn = (id: 'sell' | 'buy', label: string) => h('button', { class: `btn small${side === id ? ' primary' : ''}`, id: `trader-side-${id}`, disabled: id === 'buy' && !forSale, onclick: () => { this.traderSide = id; this.renderTrader(); } }, label);
    const nowPrice = side === 'buy' ? traderBuyPrice(d, c, this.traderPick, now) : traderPrice(d, c, this.traderPick, now);
    const base = Math.max(1, side === 'buy' ? buyPrice(d, c, this.traderPick) : sellPrice(d, this.traderPick, c));
    const nextHour = Math.ceil((Math.floor(now / HOUR_MS) + 1) * HOUR_MS - now) / 60000;
    setChildren(body, h('div', { style: 'width:470px' },
      h('div', { class: 'muted', style: 'font-size:11px;margin-bottom:6px' }, `Prices change every hour (next change in ${Math.ceil(nextHour)} min). Rare items swing more; selling many of one item lowers its price for a few hours.`),
      h('div', { class: 'row', style: 'gap:8px;align-items:center' }, h('b', {}, 'Price chart'), sel, sideBtn('sell', 'Trader pays'), sideBtn('buy', 'Trader sells')),
      h('div', { class: 'row', style: 'gap:10px;margin:4px 0;font-size:12px' },
        h('span', {}, `${pickDef.name}: `, h('b', { class: 'gold' }, `${nowPrice.toLocaleString()} Luma`)), arrow(priceChangePct(d, c, this.traderPick, now, side)),
        h('span', { class: 'muted' }, `normal shop price ${base.toLocaleString()} · ${Math.round((nowPrice / base) * 100)}%`)),
      chart(this.traderPick, 470, 150, false, side),
      h('div', { class: 'gold', style: 'font-weight:bold;margin:8px 0 4px' }, 'Sell from your bag (instant)'),
      near ? '' : h('div', { class: 'bad', style: 'font-size:11px' }, 'Stand next to a Market Trader to sell.'),
      h('div', { class: 'tlist', id: 'trader-list' }, rows.length ? rows : h('div', { class: 'muted' }, 'Nothing to sell.')),
      h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'spacer' }), h('span', { class: 'gold' }, `${c.luma.toLocaleString()} Luma`))));
  }

  // ---------------------------------------------------------------- achievements, titles, daily rewards
  private renderAchievements() {
    const w = this.app.world!, d = w.data, c = w.char, body = this.wins.get('achievements')!.body;
    const got = c.achievements ?? {};
    const reward = (a: AchievementDef) => [a.reward.luma ? `${a.reward.luma.toLocaleString()} Luma` : '', ...(a.reward.items ?? []).map((i) => `${d.items.get(i.itemId)?.name ?? i.itemId} ×${i.qty}`)].filter(Boolean).join(', ');
    const rows = ACHIEVEMENTS.map((a) => {
      const [n, goal] = a.progress(d, c), done = !!got[a.id];
      return h('div', { class: `ach${done ? ' done' : ''}`, dataset: { ach: a.id } },
        h('div', { class: 'row', style: 'gap:6px;align-items:center' },
          h('b', {}, `${done ? '🏆' : '🔒'} ${a.name}`), h('span', { class: 'spacer' }),
          done
            ? (c.title === a.id ? h('span', { class: 'good', style: 'font-size:11px' }, 'Shown') : h('button', { class: 'btn small', onclick: () => { w.setTitle(a.id); this.renderAchievements(); } }, 'Use title'))
            : h('span', { class: 'muted', style: 'font-size:11px' }, `${n.toLocaleString()} / ${goal.toLocaleString()}`)),
        h('div', { class: 'muted', style: 'font-size:11px' }, h('span', {}, a.desc), ' ', h('span', {}, 'Title: '), h('b', { 'data-noi18n': true }, `«${a.title}»`), ' ', h('span', {}, `Reward: ${reward(a)}`)),
        done ? '' : h('div', { class: 'bar' }, h('div', { style: `width:${Math.round((n / goal) * 100)}%` })));
    });
    const count = ACHIEVEMENTS.filter((a) => got[a.id]).length;
    setChildren(body, h('div', { style: 'width:420px' },
      h('div', { class: 'row', style: 'gap:8px;align-items:center;margin-bottom:6px' },
        h('span', {}, `Earned ${count} / ${ACHIEVEMENTS.length}`), h('span', { class: 'spacer' }),
        h('span', { class: 'muted' }, 'Title: '), titleOf(c) ? h('b', { class: 'gold', 'data-noi18n': true }, titleOf(c)!) : h('b', { class: 'gold' }, 'none'),
        c.title ? h('button', { class: 'btn small', onclick: () => { w.setTitle(null); this.renderAchievements(); } }, 'Hide') : ''),
      h('div', { class: 'tlist', id: 'ach-list', style: 'max-height:420px' }, rows)));
  }

  private renderBrew() {
    const w = this.app.world!, d = w.data, c = w.char, body = this.wins.get('brew')!.body;
    const st = w.stats.totalStats;
    const name = (id: string) => d.items.get(id)?.name ?? id;
    const rows = BREW_RECIPES.map((r) => {
      const out = d.items.get(r.itemId)!, miss = missingFor(c, r), chance = brewChance(c, r, st);
      return h('div', { class: 'trow brow', dataset: { recipe: r.id } },
        h('img', { src: itemIconUrl(out) }),
        h('span', { class: 'tn' }, h('b', {}, out.name), h('div', { class: 'muted', style: 'font-size:11px' },
          r.materials.map((m) => `${name(m.itemId)} ${Math.min(countItem(c, m.itemId), m.qty)}/${m.qty}`).join(' · '))),
        h('span', { class: chance >= 60 ? 'good' : chance >= 30 ? '' : 'bad' }, `${chance}%`),
        h('button', { class: 'btn small', disabled: !!miss.length, title: miss.length ? `Missing: ${miss.map((m) => name(m.itemId)).join(', ')}` : '', onclick: () => { w.brew(r.id); this.renderBrew(); } }, 'Brew'));
    });
    setChildren(body, h('div', { style: 'width:440px' },
      h('div', { class: 'muted', style: 'font-size:11px;margin-bottom:6px' },
        `Each try uses one Medicine Bowl (you have ${countItem(c, BREW_BOWL)}). A failed brew loses the materials. Chance grows with Potion Research (Lv ${c.skills.potion_research ?? 0}), Job Level, DEX, LUK and INT. Herbs drop from plant-like monsters; bottles and bowls are sold at alchemy shops.`),
      canBrew(c) ? '' : h('div', { class: 'bad' }, 'Only an Alchemist who knows Potion Research can brew.'),
      h('div', { class: 'tlist', id: 'brew-list' }, rows)));
  }

  private renderDaily() {
    const w = this.app.world!, d = w.data, c = w.char, body = this.wins.get('daily')!.body, now = w.now();
    const st = dailyStatus(c, now);
    const days = DAILY_REWARDS.map((r, i) => {
      const day = i + 1;
      const claimed = st.canClaim ? day < st.day : day <= st.day;
      const today = st.canClaim && day === st.day;
      return h('div', { class: `dday${claimed ? ' claimed' : ''}${today ? ' today' : ''}` },
        h('b', {}, `Day ${day}`),
        ...r.items.map((it) => { const def = d.items.get(it.itemId); return def ? h('div', { title: def.name }, h('img', { src: itemIconUrl(def) }), ` ×${it.qty}`) : ''; }),
        h('div', { class: 'gold', style: 'font-size:11px' }, `${r.luma.toLocaleString()} Luma`),
        claimed ? h('div', { class: 'good' }, '✔') : '');
    });
    const b = w.bonus();
    setChildren(body, h('div', { style: 'width:470px' },
      h('div', { class: 'muted', style: 'font-size:11px;margin-bottom:6px' }, 'Log in every day to move along the 7-day calendar. Missing a day starts it over at Day 1.'),
      h('div', { class: 'daily-grid' }, days),
      h('div', { class: 'row', style: 'margin-top:8px;align-items:center' },
        st.canClaim
          ? h('button', { class: 'btn', id: 'daily-claim', onclick: () => { w.claimDaily(); this.renderDaily(); } }, `Claim Day ${st.day}`)
          : h('span', { class: 'muted' }, 'Claimed today. Come back tomorrow.')),
      h('div', { class: 'gold', style: 'font-weight:bold;margin:10px 0 4px' }, 'Bonus events (local time)'),
      h('div', { style: 'font-size:12px' }, `EXP +50% every day ${BONUS_HOURS.map(([a, z]) => `${a}:00–${z}:00`).join(' and ')}. Drops +50% all day Saturday and Sunday.`),
      h('div', { style: 'font-size:12px;margin-top:4px' }, b.labels.length ? h('span', { class: 'good' }, `Active now: ${b.labels.join(', ')}`) : h('span', { class: 'muted' }, 'No bonus is active right now.'))));
  }

  // ---------------------------------------------------------------- Market Hall (player-to-player, online only)
  private marketTab: 'browse' | 'sell' | 'mine' = 'browse';
  private marketQuery = '';
  private marketPick = '';
  private marketDraft = { uid: '', qty: 1, price: 0 };
  private marketLoadedAt = 0;
  private renderMarket() {
    const app = this.app, on = app.online, w = app.world!, d = w.data, c = w.char, body = this.wins.get('market')!.body;
    const focused = document.activeElement;
    if (focused && body.contains(focused) && (focused.tagName === 'INPUT' || focused.tagName === 'SELECT')) return;
    if (!on.isOnline) {
      setChildren(body, h('div', { style: 'width:420px' },
        h('div', {}, 'The Market Hall lists goods from other adventurers, and only real players buy them.'),
        h('div', { class: 'bad', style: 'margin-top:6px' }, 'You are offline. Log in to a server in the Social window (G) to use the Market Hall.'),
        h('button', { class: 'btn small', style: 'margin-top:6px', onclick: () => this.open('social') }, 'Open Social')));
      return;
    }
    if (performance.now() - this.marketLoadedAt > 5000) { this.marketLoadedAt = performance.now(); on.marketBrowse(); }
    const tabs = h('div', { class: 'row', style: 'gap:4px;margin-bottom:6px' }, ...([['browse', 'Browse'], ['sell', 'Sell'], ['mine', 'My listings']] as const).map(([id, label]) =>
      h('button', { class: `btn small${this.marketTab === id ? ' primary' : ''}`, id: `mk-tab-${id}`, onclick: () => { this.marketTab = id; this.renderMarket(); } }, label)));
    const icon = (itemId: string) => h('img', { src: itemIconUrl(d.items.get(itemId)!) });
    const label = (l: { itemId: string; inst: ItemInstance }) => `${l.inst.refine ? `+${l.inst.refine} ` : ''}${d.items.get(l.itemId)?.name ?? l.itemId}${l.inst.cards?.length ? ` [${l.inst.cards.length}]` : ''}`;
    // Recent real sales in the Market Hall (as text; the price graphs are at Trader Moss).
    const salesChart = (itemId: string) => {
      const pts = (on.marketHistory.get(itemId) ?? []).slice(-10);
      if (!pts.length) return h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, 'No sales of this item yet.');
      const avg = Math.round(pts.reduce((a, [, p]) => a + p, 0) / pts.length);
      return h('div', { style: 'font-size:12px;margin-top:6px' }, `Recent sales of ${d.items.get(itemId)?.name ?? itemId}: last ${pts[pts.length - 1][1].toLocaleString()} · average ${avg.toLocaleString()} (${pts.length} sales)`);
    };
    let content: HTMLElement;
    if (this.marketTab === 'browse') {
      const q = this.marketQuery.toLowerCase();
      const list = on.marketListings.filter((l) => l.seller !== c.name && (!q || (d.items.get(l.itemId)?.name ?? l.itemId).toLowerCase().includes(q)));
      const search = h('input', { id: 'mk-search', placeholder: 'Search…', value: this.marketQuery, class: 'text-input', style: 'width:200px' }) as HTMLInputElement;
      search.addEventListener('change', () => { this.marketQuery = search.value; this.renderMarket(); });
      content = h('div', {},
        h('div', { class: 'row', style: 'gap:6px' }, search, h('button', { class: 'btn small', onclick: () => { this.marketLoadedAt = 0; this.renderMarket(); } }, 'Refresh')),
        h('div', { class: 'tlist', id: 'mk-list', style: 'margin-top:6px' }, list.length ? list.map((l) =>
          h('div', { class: 'mrow', onclick: () => { this.marketPick = l.itemId; on.marketHistoryOf(l.itemId); this.renderMarket(); } },
            icon(l.itemId), h('span', { class: 'tn' }, label(l)), h('span', {}, `×${l.qty}`), h('span', { class: 'gold' }, `${l.price.toLocaleString()}`), h('span', { class: 'muted' }, l.seller),
            h('button', { class: 'btn small', onclick: (e: Event) => { e.stopPropagation(); if (l.qty === 1) on.marketBuy(l, 1); else this.askNumber('Buy how many?', l.qty, (n) => on.marketBuy(l, n)); } }, 'Buy'))) : h('div', { class: 'muted', style: 'padding:6px' }, 'No goods listed by other players right now.')),
        this.marketPick ? salesChart(this.marketPick) : '');
    } else if (this.marketTab === 'sell') {
      const sellable = c.inventory.filter((i) => { const def = d.items.get(i.itemId)!; return def.type !== 'quest' && !i.bound && !def.bound && !i.locked; });
      if (!sellable.some((i) => i.uid === this.marketDraft.uid)) this.marketDraft = { uid: sellable[0]?.uid ?? '', qty: 1, price: 0 };
      const inst = sellable.find((i) => i.uid === this.marketDraft.uid);
      const sel = h('select', { id: 'mk-item', style: 'width:220px' }, sellable.map((i) => h('option', { value: i.uid }, `${i.refine ? `+${i.refine} ` : ''}${d.items.get(i.itemId)!.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`))) as HTMLSelectElement;
      sel.value = this.marketDraft.uid;
      sel.addEventListener('change', () => { this.marketDraft = { uid: sel.value, qty: 1, price: 0 }; const it = c.inventory.find((i) => i.uid === sel.value); if (it) on.marketHistoryOf(it.itemId); this.renderMarket(); });
      const npcPrice = inst ? traderPrice(d, c, inst.itemId, w.now()) : 0;
      const hist = inst ? on.marketHistory.get(inst.itemId) ?? [] : [];
      const lastSale = hist.length ? hist[hist.length - 1][1] : 0;
      if (inst && !this.marketDraft.price) this.marketDraft.price = Math.max(1, lastSale || Math.round(npcPrice * 1.5));
      const qty = h('input', { id: 'mk-qty', type: 'number', min: 1, max: inst?.qty ?? 1, value: this.marketDraft.qty, style: 'width:64px' }) as HTMLInputElement;
      const price = h('input', { id: 'mk-price', type: 'number', min: 1, value: this.marketDraft.price, style: 'width:110px' }) as HTMLInputElement;
      qty.addEventListener('change', () => { this.marketDraft.qty = Math.max(1, Math.min(inst?.qty ?? 1, Math.floor(Number(qty.value) || 1))); });
      price.addEventListener('change', () => { this.marketDraft.price = Math.max(1, Math.floor(Number(price.value) || 1)); });
      content = inst ? h('div', {},
        h('div', { class: 'row', style: 'gap:6px' }, 'Item', sel),
        h('div', { class: 'row', style: 'gap:6px;margin-top:6px' }, 'Qty', qty, 'Price each', price, 'Luma'),
        h('div', { class: 'muted', style: 'font-size:11px;margin-top:4px' }, `Market Trader pays ${npcPrice.toLocaleString()} now${lastSale ? ` · last sale here ${lastSale.toLocaleString()}` : ''}. The item stays with the Market Hall until a player buys it or you cancel; you are paid even if you are offline.`),
        h('button', { class: 'btn primary', id: 'mk-list-btn', style: 'margin-top:6px', onclick: () => { this.marketDraft.qty = Math.max(1, Math.min(inst.qty, Math.floor(Number(qty.value) || 1))); this.marketDraft.price = Math.max(1, Math.floor(Number(price.value) || 1)); on.marketList(inst.uid, this.marketDraft.qty, this.marketDraft.price); } }, 'List for sale'),
        salesChart(inst.itemId))
        : h('div', { class: 'muted' }, 'Nothing in your bag can be sold.');
    } else {
      const mine = on.marketListings.filter((l) => l.seller === c.name);
      content = h('div', { class: 'tlist', id: 'mk-mine' }, mine.length ? mine.map((l) => h('div', { class: 'mrow' },
        icon(l.itemId), h('span', { class: 'tn' }, label(l)), h('span', {}, `×${l.qty}`), h('span', { class: 'gold' }, `${l.price.toLocaleString()}`), h('span', { class: 'muted' }, new Date(l.listedAt).toLocaleDateString()),
        h('button', { class: 'btn small', onclick: () => on.marketCancel(l.id) }, 'Cancel'))) : h('div', { class: 'muted', style: 'padding:6px' }, 'You have nothing listed.'));
    }
    setChildren(body, h('div', { style: 'width:460px' }, tabs, content,
      h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'muted', style: 'font-size:11px' }, `Up to 10 listings · only real players buy here`), h('span', { class: 'spacer' }), h('span', { class: 'gold' }, `${c.luma.toLocaleString()} Luma`))));
  }

  // ---------------------------------------------------------------- social / online play
  private socialDraft = { trade: [] as { uid: string; qty: number }[], tradeLuma: 0, shop: [] as { uid: string; qty: number; price: number }[], shopTitle: 'My shop' };
  private renderSocial() {
    const app = this.app, on = app.online, w = app.world, body = this.wins.get('social')!.body;
    // Don't wipe a field the player is typing in.
    const focused = document.activeElement;
    if (focused && body.contains(focused) && (focused.tagName === 'INPUT' || focused.tagName === 'SELECT')) return;
    const sec = (title: string, ...kids: (HTMLElement | string)[]) => h('div', { style: 'margin-top:8px;border-top:1px solid #4a3a2a;padding-top:6px' }, h('div', { class: 'gold', style: 'font-weight:bold' }, title), ...kids);
    const btn = (label: string, fn: () => void, id?: string) => h('button', { class: 'btn small', ...(id ? { id } : {}), onclick: () => { fn(); setTimeout(() => this.renderSocial(), 150); } }, label);
    const input = (id: string, value: string, ph: string, type = 'text', width = 140) => h('input', { id, type, value, placeholder: ph, class: 'text-input', style: `width:${width}px` }) as HTMLInputElement;
    if (!on.net.online || !on.joined) {
      const url = input('net-url', app.settings.serverUrl ?? defaultServerUrl(), 'ws://host:7171', 'text', 200);
      const user = input('net-user', app.settings.serverUser ?? '', 'account');
      const pass = input('net-pass', '', 'password', 'password');
      const go = (register: boolean) => {
        app.settings.serverUrl = url.value.trim(); app.settings.serverUser = user.value.trim(); app.applySettings();
        on.connect(url.value.trim(), user.value.trim(), pass.value, register).catch((e) => app.hud?.toast(String((e as Error).message ?? e), true));
      };
      setChildren(body, h('div', { style: 'width:380px' },
        h('div', { class: 'muted', style: 'font-size:11px' }, 'Online play: the server also hosts this game, so use the address of the page you opened. On your own computer use ws://localhost:7171 (`npm start`). Without a server the game stays single-player. Characters and items are still saved in this browser; the server only connects players, so it is not protected against cheating.'),
        h('div', { class: 'row', style: 'gap:6px;margin-top:6px' }, 'Server', url),
        h('div', { class: 'row', style: 'gap:6px;margin-top:4px' }, user, pass),
        h('div', { class: 'row', style: 'gap:6px;margin-top:6px' }, btn('Log in', () => go(false), 'net-login'), btn('Create account', () => go(true), 'net-register')),
        h('div', { class: on.net.lastError ? 'bad' : 'muted', style: 'margin-top:6px;font-size:11px' }, `Status: ${on.net.status}${on.net.lastError ? ` — ${on.net.lastError}` : ''}`)));
      return;
    }
    const c = w.char;
    const here = [...on.players.values()].filter((p) => p.mapId === w.map.def.id);
    const pvpHere = ['proving_grounds', 'castle_veyl'].includes(w.map.def.id);
    const playerRows = here.length ? here.map((p) => h('div', { class: 'row', style: 'gap:4px;margin:2px 0;flex-wrap:wrap' },
      h('span', { style: 'min-width:120px' }, `${p.name} · Lv ${p.level} ${w.data.classes.get(p.classId)?.name ?? p.classId}${p.guild ? ` <${p.guild}>` : ''}${p.vending ? ` 🛒 ${p.vending}` : ''}`),
      btn('Party', () => on.partyInvite(p.name)), btn('Trade', () => on.tradeRequest(p.name), `net-trade-${p.name}`),
      on.guild?.master === c.name ? btn('Guild', () => on.guildInvite(p.name)) : '',
      p.vending ? btn('Shop', () => on.viewShop(p.name), `net-shop-${p.name}`) : '',
      pvpHere ? btn('Attack', () => w.attackRemote(p.name)) : ''))
      : [h('div', { class: 'muted' }, 'Nobody else on this map.')];
    const invites = on.invites.map((inv) => h('div', { class: 'row', style: 'gap:6px' }, h('span', {}, inv.label), btn('Accept', () => on.accept(inv), `net-accept-${inv.kind}`), btn('Decline', () => { on.invites = on.invites.filter((x) => x !== inv); })));
    const party = on.party ? [h('div', {}, on.party.members.map((m) => h('div', {}, `${m.name === on.party!.leader ? '★ ' : ''}${m.name} · Lv ${m.level} · ${m.online ? w.data.maps.get(m.mapId)?.name ?? m.mapId : 'offline'} · ${Math.round(m.hpPct * 100)}% HP`))),
      h('div', { class: 'muted', style: 'font-size:11px' }, `EXP is shared evenly with ${w.partyShareWith} member(s) on this map within ${15} levels. Chat: /p text`), btn('Leave party', () => on.partyLeave())]
      : [h('div', { class: 'muted' }, 'Not in a party. Invite someone from the list above.')];
    const gname = input('net-guild-name', '', 'guild name');
    const guild = on.guild ? [h('div', {}, `${on.guild.name} · master ${on.guild.master} · ${on.guild.members.length} members (${on.guild.online.length} online)`), h('div', { class: 'muted', style: 'font-size:11px' }, 'Chat: /g text'), btn('Leave guild', () => on.guildLeave())]
      : [h('div', { class: 'row', style: 'gap:6px' }, gname, btn('Found guild (50,000 Luma)', () => on.guildCreate(gname.value.trim()), 'net-guild-create'))];
    const invItems = c.inventory.filter((i) => !i.locked);
    const itemPick = (id: string) => h('select', { id, style: 'max-width:180px' }, invItems.map((i) => h('option', { value: i.uid }, `${w.data.items.get(i.itemId)!.name}${i.refine ? ` +${i.refine}` : ''} ×${i.qty}`))) as HTMLSelectElement;
    const name = (i: { itemId: string; refine?: number; qty: number }) => `${w.data.items.get(i.itemId)?.name ?? i.itemId}${i.refine ? ` +${i.refine}` : ''} ×${i.qty}`;
    const parts: HTMLElement[] = [];
    if (on.trade) {
      const t = on.trade, pick = itemPick('net-trade-item'), qty = input('net-trade-qty', '1', 'qty', 'number', 50), luma = input('net-trade-luma', String(this.socialDraft.tradeLuma), 'Luma', 'number', 80);
      parts.push(sec(`Trade with ${t.with}`,
        h('div', { class: 'row', style: 'gap:10px;align-items:flex-start' },
          h('div', { style: 'flex:1' }, h('div', {}, `You offer${t.mine.locked ? ' 🔒' : ''}${t.mine.confirmed ? ' ✓' : ''}`), ...t.mine.items.map((i) => h('div', { class: 'muted' }, name(i))), h('div', { class: 'muted' }, `${t.mine.luma} Luma`)),
          h('div', { style: 'flex:1' }, h('div', {}, `${t.with} offers${t.theirs.locked ? ' 🔒' : ''}${t.theirs.confirmed ? ' ✓' : ''}`), ...t.theirs.items.map((i) => h('div', { class: 'muted' }, name(i))), h('div', { class: 'muted' }, `${t.theirs.luma} Luma`))),
        t.mine.locked ? '' : h('div', { class: 'row', style: 'gap:4px;margin-top:4px;flex-wrap:wrap' }, pick, qty, btn('Add', () => { this.socialDraft.trade.push({ uid: pick.value, qty: Math.max(1, Number(qty.value) || 1) }); on.tradeOffer(this.socialDraft.trade, this.socialDraft.tradeLuma); }, 'net-trade-add'),
          luma, btn('Set Luma', () => { this.socialDraft.tradeLuma = Math.max(0, Number(luma.value) || 0); on.tradeOffer(this.socialDraft.trade, this.socialDraft.tradeLuma); }), btn('Clear', () => { this.socialDraft.trade = []; this.socialDraft.tradeLuma = 0; on.tradeOffer([], 0); })),
        h('div', { class: 'row', style: 'gap:6px;margin-top:4px' }, btn('Lock', () => on.tradeLock(), 'net-trade-lock'), btn('Confirm', () => on.tradeConfirm(), 'net-trade-confirm'), btn('Cancel', () => { this.socialDraft.trade = []; on.tradeCancel(); }))));
    } else this.socialDraft.trade = [];
    if (on.shopView) {
      const v = on.shopView;
      parts.push(sec(`${v.seller}'s shop: ${v.title}`, ...v.listings.map((l) => h('div', { class: 'row', style: 'gap:6px' }, h('span', { style: 'flex:1' }, `${name(l.inst)} · ${l.price} Luma each`), btn('Buy 1', () => on.buy(v.seller, l.uid, 1, l.price), `net-buy-${l.uid}`))),
        btn('Close', () => { on.shopView = null; })));
    }
    if (w.canCart || on.myShop) {
      if (on.myShop) parts.push(sec(`Your shop: ${on.myShop.title}`, ...on.myShop.listings.map((l) => h('div', { class: 'muted' }, `${name(l.inst)} · ${l.price} Luma`)), btn('Close shop', () => on.closeShop())));
      else {
        const pick = itemPick('net-shop-item'), qty = input('net-shop-qty', '1', 'qty', 'number', 50), price = input('net-shop-price', '100', 'price', 'number', 70), title = input('net-shop-title', this.socialDraft.shopTitle, 'shop title');
        parts.push(sec('Vending (Merchant line)', ...this.socialDraft.shop.map((l) => h('div', { class: 'muted' }, `${name({ ...findInstance(c, l.uid)!, qty: l.qty })} · ${l.price} Luma`)),
          h('div', { class: 'row', style: 'gap:4px;flex-wrap:wrap' }, pick, qty, price, btn('Add', () => { this.socialDraft.shop.push({ uid: pick.value, qty: Math.max(1, Number(qty.value) || 1), price: Math.max(1, Number(price.value) || 1) }); }, 'net-shop-add')),
          h('div', { class: 'row', style: 'gap:4px' }, title, btn('Open shop', () => { this.socialDraft.shopTitle = title.value || 'Shop'; on.openShop(this.socialDraft.shopTitle, this.socialDraft.shop); this.socialDraft.shop = []; }, 'net-shop-open'))));
      }
    }
    const woe = on.woe;
    setChildren(body, h('div', { style: 'width:420px;max-height:560px;overflow:auto' },
      h('div', { class: 'row' }, h('span', { class: 'good' }, `● Online as ${on.net.user} (${c.name})`), h('span', { class: 'spacer' }), btn('Disconnect', () => on.disconnect())),
      invites.length ? sec('Invitations', ...invites) : '',
      ...parts,
      sec(`Players on ${w.map.def.name}`, ...playerRows, pvpHere ? h('div', { class: 'bad', style: 'font-size:11px' }, 'PvP area: other players can attack you here (basic attacks).') : ''),
      sec('Party', ...party),
      sec('Guild', ...guild),
      sec('Guild war — Castle Veyl', h('div', {}, woe ? `${woe.active ? 'OPEN NOW' : 'Closed (opens 20:00–21:00 server time)'} · Holder: ${woe.owner ?? 'nobody'} · Emperium ${woe.emperiumHp}/${woe.emperiumMax}` : '—'),
        h('div', { class: 'muted', style: 'font-size:11px' }, 'Reach the castle through the Arena Master in Aurelion. Guild members break the Emperium to take the castle; the holding guild gets +10% EXP.'))));
  }

  // ---------------------------------------------------------------- rune constellation
  private renderRunes() {
    const w = this.app.world!, d = w.data, c = w.char, body = this.wins.get('runes')!.body;
    const cols = [...d.runes.values()].map((k) => h('div', { style: `border:1px solid ${k.color}55;border-radius:6px;padding:6px;width:190px` },
      h('div', { style: `color:${k.color};font-weight:bold` }, k.name), h('div', { class: 'muted', style: 'font-size:10px;margin-bottom:4px' }, k.theme),
      k.nodes.map((n) => {
        const rank = c.runes?.[n.id] ?? 0, chk = canLearnRune(d, c, n.id);
        return h('div', { class: 'row', style: 'margin:3px 0;gap:4px;align-items:center' },
          h('div', { style: `width:14px;height:14px;border-radius:50%;background:${rank ? k.color : '#2a2433'};border:1px solid ${k.color}` }),
          h('div', { style: 'flex:1' }, h('div', { style: n.max === 1 ? 'font-weight:bold' : '' }, `${n.name} ${rank}/${n.max}`),
            h('div', { class: 'muted', style: 'font-size:10px' }, `${modsText(n.mods).join(', ')}${n.max > 1 ? ' per rank' : ''}${n.requires.length ? ` · after ${n.requires.map((r) => k.nodes.find((x) => x.id === r)?.name).join(' + ')}` : ''}`)),
          h('button', { class: 'btn small', id: `rune-${n.id}`, disabled: !chk.ok, title: chk.ok ? 'Spend a rune point' : chk.error, onclick: () => { w.learnRuneCmd(n.id); this.renderRunes(); } }, '+'));
      })));
    setChildren(body, h('div', {},
      h('div', { class: 'row', style: 'margin-bottom:6px' }, h('span', { class: 'gold' }, `Rune points: ${runePointsLeft(c)} / ${runePointsTotal(c)}`), h('span', { class: 'spacer' }),
        h('span', { class: 'muted', style: 'font-size:11px' }, c.baseLevel < 30 ? 'Opens at Base Lv 30' : 'One point every two base levels · reset at the Astrologer in Arcanthe')),
      h('div', { class: 'row', style: 'gap:8px;align-items:flex-start' }, cols)));
  }

  // ---------------------------------------------------------------- pushcart
  private renderCart() {
    const w = this.app.world!, c = w.char, body = this.wins.get('cart')!.body;
    if (!c.cart) { setChildren(body, h('div', { class: 'muted' }, 'No pushcart. Merchants can rent one at a Merchant guild.')); return; }
    const grid = h('div', { class: 'inv-grid' });
    for (let i = 0; i < 60; i++) {
      const inst = c.cart[i];
      const el = h('div', { class: 'islot' });
      if (inst) {
        const def = w.data.items.get(inst.itemId)!;
        el.append(h('img', { src: itemIconUrl(def) }), inst.qty > 1 ? h('span', { class: 'q' }, String(inst.qty)) : '');
        el.addEventListener('mousemove', (e) => this.showTooltip(e, this.itemTooltip(def, inst)));
        el.addEventListener('mouseleave', () => this.hideTooltip());
        el.addEventListener('dblclick', () => this.qtyPrompt(inst, 'Take how many?', (n) => w.cartTake(inst.uid, n)));
      }
      grid.appendChild(el);
    }
    grid.addEventListener('dragover', (e) => e.preventDefault());
    grid.addEventListener('drop', (e) => {
      const dd = getDragData(e);
      if (dd?.type !== 'inv') return;
      e.preventDefault();
      const inst = c.inventory.find((x) => x.uid === dd.id);
      if (inst) this.qtyPrompt(inst, 'Put how many in the cart?', (n) => w.cartPut(inst.uid, n));
    });
    setChildren(body, h('div', { class: 'row', style: 'margin-bottom:6px' }, h('span', {}, `Cart ${c.cart.length}/${CART_SLOTS} · weight ${cartWeight(w.data, c)}/${CART_WEIGHT}`)), grid,
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, 'Drag items from your inventory here · Double-click to take out. Cart weight does not count toward yours.'));
  }

  private renderDatabase() {
    const w = this.app.world!, d = w.data, body = this.wins.get('database')!.body, st = this.db;
    const pct = (c: number) => (c >= 0.01 ? `${+(c * 100).toFixed(2)}%` : `${+(c * 100).toFixed(3)}%`);
    const itemName = (id: string) => d.items.get(id)?.name ?? id;
    const mapsOf = (monsterId: string) => [...d.maps.values()].filter((m) => m.monsterSpawns.some((s) => s.monsterId === monsterId) || (m.bossSpawn && d.bosses.get(m.bossSpawn.bossId)?.monsterId === monsterId)).map((m) => m.name);
    const droppedBy = (itemId: string) => [...d.monsters.values()].flatMap((m) => {
      const e = d.drops.get(m.dropTableId)?.entries.find((x) => x.itemId === itemId);
      return e ? [{ m, chance: e.chance }] : [];
    }).sort((a, b) => b.chance - a.chance);
    const link = (label: string, tab: typeof st.tab, id: string) => h('a', { href: '#', style: 'color:#7fd6ff', onclick: (e: MouseEvent) => { e.preventDefault(); Object.assign(st, { tab, sel: id }); this.renderDatabase(); } }, label);

    const TABS: [DbTab, string][] = [['monsters', `Monsters (${d.monsters.size})`], ['items', 'Items'], ['cards', 'Cards'], ['refine', 'Refine sim'], ['forge', 'Forge calc'], ['options', 'Options'], ['combos', 'Combos'], ['pets', 'Pets'], ['elements', 'Elements']];
    const tabs = h('div', { class: 'filters', style: 'flex-wrap:wrap' }, TABS.map(([t, label]) => h('button', {
      class: `btn small${st.tab === t ? ' active' : ''}`, id: `db-tab-${t}`, onclick: () => { Object.assign(st, { tab: t, filter: '', sel: '' }); this.renderDatabase(); },
    }, label)));
    if (!['monsters', 'items', 'cards'].includes(st.tab)) {
      setChildren(body, h('div', { style: 'width:720px' }, tabs, h('div', { style: 'margin-top:8px;min-height:400px' }, this.renderDbTool())));
      return;
    }
    // List
    const q = st.q.toLowerCase();
    let rows: { id: string; label: string; sub: string }[] = [];
    let filters: [string, string][] = [];
    if (st.tab === 'monsters') {
      filters = [['', 'All races'], ...[...new Set([...d.monsters.values()].map((m) => m.race))].sort().map((r): [string, string] => [r, r])];
      rows = [...d.monsters.values()].filter((m) => (!st.filter || m.race === st.filter) && m.name.toLowerCase().includes(q))
        .sort((a, b) => a.level - b.level).map((m) => ({ id: m.id, label: `${m.name}`, sub: `Lv ${m.level} · ${m.element} ${m.elementLevel ?? 1} · ${m.size}${m.aiType === 'boss' ? ' · MVP' : m.elite ? ' · Elite' : ''}${m.looter ? ' · Looter' : ''}` }));
    } else {
      const cards = st.tab === 'cards';
      filters = cards ? [['', 'All slots'], ...['weapon', 'armor', 'shield', 'garment', 'boots', 'headgear', 'accessory'].map((s): [string, string] => [s, s])]
        : [['', 'All types'], ['equipment', 'equipment'], ['consumable', 'consumable'], ['material', 'material'], ...['weapon', 'armor', 'headgear', 'shield', 'garment', 'boots', 'accessory'].map((s): [string, string] => [`slot:${s}`, `· ${s}`])];
      rows = [...d.items.values()].filter((i) => (cards ? i.type === 'card' && (!st.filter || i.card?.equip === st.filter)
        : i.type !== 'card' && (!st.filter || (st.filter.startsWith('slot:') ? i.slot === st.filter.slice(5) : i.type === st.filter))) && i.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name)).map((i) => ({ id: i.id, label: i.name, sub: cards ? `${i.card!.equip}` : `${i.weaponType ?? i.slot ?? i.type}${i.weaponLevel ? ` · W.Lv ${i.weaponLevel}` : ''}` }));
    }
    if (!rows.some((r) => r.id === st.sel)) st.sel = rows[0]?.id ?? '';
    const search = h('input', { id: 'db-search', class: 'text-input', placeholder: 'Search…', value: st.q, style: 'width:100%' });
    search.addEventListener('input', () => { st.q = search.value; this.renderDatabase(); const el = document.getElementById('db-search') as HTMLInputElement | null; el?.focus(); el?.setSelectionRange(st.q.length, st.q.length); });
    const filt = h('select', { id: 'db-filter', style: 'width:100%' }, filters.map(([v, l]) => h('option', { value: v }, l)));
    filt.value = st.filter;
    filt.addEventListener('change', () => { st.filter = filt.value; this.renderDatabase(); });
    const list = h('div', { style: 'height:330px;overflow:auto;margin-top:4px' }, rows.map((r) => h('div', {
      class: 'db-row', style: `padding:3px 5px;cursor:pointer;border-radius:3px;${r.id === st.sel ? 'background:rgba(255,211,77,0.18)' : ''}`,
      onclick: () => { st.sel = r.id; this.renderDatabase(); },
    }, h('div', {}, r.label), h('div', { class: 'muted', style: 'font-size:10px' }, r.sub))));

    // Detail
    const detail: HTMLElement[] = [];
    const kv = (k: string, v: string | number) => h('tr', {}, h('td', { class: 'muted', style: 'padding-right:8px' }, k), h('td', {}, String(v)));
    if (st.tab === 'monsters' && st.sel) {
      const m = d.monsters.get(st.sel)!;
      const table = d.drops.get(m.dropTableId);
      detail.push(h('h3', { style: 'margin:0 0 4px' }, `${m.name}${m.aiType === 'boss' ? ' (MVP)' : ''}`),
        h('table', {}, kv('Level', m.level), kv('Race / Size', `${m.race} / ${m.size}`), kv('Element', `${m.element} ${m.elementLevel ?? 1}`), kv('Type', m.aiType === 'boss' ? 'MVP boss' : m.elite ? 'Elite mini-boss' : m.aiType), ...(m.looter ? [kv('Looter', 'Picks up items on the ground')] : []), kv('HP', m.maxHp),
          kv('ATK / DEF / MDEF', `${m.attack} / ${m.defense} / ${m.magicDefense ?? 0}`), kv('Base / Job EXP', `${m.exp} / ${m.jobExp}`),
          kv('Behaviour', m.aiType), kv('Luma', table?.luma ? `${table.luma[0]}–${table.luma[1]}` : '—')),
        h('div', { class: 'gold', style: 'margin-top:6px' }, 'Found in'), h('div', {}, mapsOf(m.id).join(', ') || '—'),
        h('div', { class: 'gold', style: 'margin-top:6px' }, 'Drops'),
        h('table', {}, (table?.entries ?? []).map((e) => h('tr', {}, h('td', { style: 'padding-right:8px' }, link(itemName(e.itemId), d.items.get(e.itemId)?.type === 'card' ? 'cards' : 'items', e.itemId)), h('td', { class: 'muted' }, pct(e.chance))))));
    } else if (st.sel) {
      const it = d.items.get(st.sel)!;
      detail.push(...this.itemTooltip(it));
      if (it.weaponLevel) detail.push(h('div', {}, `Weapon Lv ${it.weaponLevel} · safe refine +${[7, 6, 5, 4][it.weaponLevel - 1]}`));
      if (it.cardSlots) detail.push(h('div', {}, `Card slots: ${it.cardSlots}`));
      const by = droppedBy(it.id);
      detail.push(h('div', { class: 'gold', style: 'margin-top:6px' }, 'Dropped by'),
        by.length ? h('table', {}, by.slice(0, 12).map(({ m, chance }) => h('tr', {}, h('td', { style: 'padding-right:8px' }, link(`${m.name} (Lv ${m.level})`, 'monsters', m.id)), h('td', { class: 'muted' }, pct(chance))))) : h('div', { class: 'muted' }, '—'));
      const shops = [...d.shops.values()].filter((s) => s.items.includes(it.id)).map((s) => s.name);
      if (shops.length) detail.push(h('div', { class: 'gold', style: 'margin-top:6px' }, 'Sold at'), h('div', {}, shops.join(', ')));
      const rec = [...d.recipes.values()].find((r) => r.itemId === it.id);
      if (rec) detail.push(h('div', { class: 'gold', style: 'margin-top:6px' }, 'Forge recipe'), h('div', {}, `${rec.materials.map((m) => `${m.qty}× ${itemName(m.itemId)}`).join(', ')} · ${rec.fee} Luma`));
      const usedIn = [...d.recipes.values()].filter((r) => r.materials.some((m) => m.itemId === it.id)).map((r) => itemName(r.itemId));
      if (usedIn.length) detail.push(h('div', { class: 'gold', style: 'margin-top:6px' }, 'Used to forge'), h('div', {}, usedIn.join(', ')));
    }
    setChildren(body, h('div', { style: 'width:720px' }, tabs,
      h('div', { style: 'display:grid;grid-template-columns:240px 1fr;gap:12px;margin-top:6px' },
        h('div', {}, search, filt, list),
        h('div', { id: 'db-detail', style: 'height:400px;overflow:auto' }, detail))));
  }

  // ---------------------------------------------------------------- GM / admin
  private adminSel: Record<string, string> = {};
  private adminTab: 'main' | 'power' | 'world' | 'console' = 'main';
  private adminLog: string[] = [];
  private renderAdmin() {
    const app = this.app, w = app.world, body = this.wins.get('admin')!.body;
    if (!w) { setChildren(body, h('div', {}, 'Enter the game to use GM tools.')); return; }
    const d = w.data;
    const run = (r: { ok: boolean; message?: string; error?: string }) => {
      app.hud?.toast(r.ok ? r.message ?? 'Done.' : r.error ?? 'Failed.', !r.ok);
      this.refresh(); // re-renders every open window, this one included
    };
    const sel = (key: string, opts: [string, string][]) => {
      const el = h('select', { id: `gm-${key}`, style: 'flex:1;min-width:0' }, opts.map(([v, label]) => h('option', { value: v }, label)));
      el.value = this.adminSel[key] ?? opts[0]?.[0] ?? '';
      this.adminSel[key] = el.value;
      el.addEventListener('change', () => { this.adminSel[key] = el.value; });
      return el;
    };
    const num = (key: string, value: number, width = 56) => {
      const el = h('input', { id: `gm-${key}`, type: 'number', value: String(this.adminSel[key] ?? value), style: `width:${width}px` });
      el.addEventListener('change', () => { this.adminSel[key] = el.value; });
      return el;
    };
    const val = (key: string, dflt = 0) => Number(this.adminSel[key] ?? dflt);
    const btn = (label: string, fn: () => void, cls = 'btn small') => h('button', { class: cls, onclick: fn }, label);
    const section = (title: string, ...rows: HTMLElement[]) => h('div', { style: 'margin-bottom:8px' },
      h('div', { class: 'gold', style: 'font-weight:bold;margin-bottom:3px' }, title), ...rows.map((r) => { r.style.marginBottom = '4px'; return r; }));
    const row = (...c: (HTMLElement | string)[]) => h('div', { class: 'row' }, ...c);
    const c = w.char;
    const tabs = h('div', { class: 'row', style: 'margin-bottom:6px;gap:4px' }, ...([['main', 'Main'], ['power', 'Character+'], ['world', 'World & rates'], ['console', '@ Console']] as const).map(([id, label]) =>
      btn(label, () => { this.adminTab = id; this.renderAdmin(); }, this.adminTab === id ? 'btn small primary' : 'btn small')));
    const note = h('div', { style: 'font-size:11px;opacity:0.75;margin-bottom:6px' }, 'Local single-player tools. Changes apply to this save only; using them marks the character as GM-edited.');
    const onOff = (label: string, on: boolean, fn: () => void) => btn(`${label}: ${on ? 'ON' : 'OFF'}`, fn, on ? 'btn small primary' : 'btn small');
    if (this.adminTab === 'power') {
      setChildren(body, h('div', { style: 'width:400px' }, tabs, note,
        section('Levels & stats',
          row('Base Lv', num('setB', c.baseLevel, 52), 'Job Lv', num('setJ', c.jobLevel, 52), btn('Set exactly', () => run(gm.gmSetLevels(w, val('setB', c.baseLevel), val('setJ', c.jobLevel))))),
          row(sel('stat', [['all', 'All stats'], ...STAT_KEYS.map((k) => [k, k.toUpperCase()] as [string, string])]), num('statv', 99, 52), btn('Set', () => run(this.adminSel.stat === 'all' ? gm.gmSetAllStats(w, val('statv', 99)) : gm.gmSetStat(w, this.adminSel.stat as never, val('statv', 99))))),
          row(btn('Max all skills', () => run(gm.gmMaxSkills(w))), btn('Reset stats', () => run(gm.gmReset(w, 'stats'))), btn('Reset skills', () => run(gm.gmReset(w, 'skills')))),
          row('Set Luma', num('setLuma', c.luma, 100), btn('Set', () => run(gm.gmSetLuma(w, val('setLuma', c.luma)))), btn('Rebirth now', () => run(gm.gmRebirth(w))))),
        section('Item made to order',
          row(sel('item2', [...d.items.values()].filter((x) => x.type === 'equipment').sort((a, b) => a.name.localeCompare(b.name)).map((x) => [x.id, x.name])), '+', num('ref', 10, 44)),
          row(sel('elem', [['', 'No element'], ...['fire', 'water', 'earth', 'wind', 'holy', 'shadow', 'ghost', 'poison', 'undead'].map((e) => [e, e] as [string, string])]),
            sel('card', [['', 'No card'], ...[...d.items.values()].filter((x) => x.type === 'card').sort((a, b) => a.name.localeCompare(b.name)).map((x) => [x.id, x.name] as [string, string])]),
            btn('Give', () => run(gm.gmGiveItemFull(w, this.adminSel.item2, { refine: val('ref', 10), element: this.adminSel.elem || undefined, cards: this.adminSel.card ? [this.adminSel.card] : undefined })))),
          row(sel('slot', EQUIP_SLOTS.map((s) => [s, s])), '+', num('ref2', 10, 44), btn('Refine equipped', () => run(gm.gmRefineEquipped(w, this.adminSel.slot, val('ref2', 10)))), btn('Clear inventory', () => run(gm.gmClearInventory(w)), 'btn small danger'))),
        section('Companions & runes',
          row(sel('pet', [...d.pets.values()].map((p) => [p.monsterId, p.name])), btn('Give pet', () => run(gm.gmPet(w, this.adminSel.pet)))),
          row(sel('homun', [...d.homunculi.values()].map((x) => [x.id, x.name])), 'Lv', num('hlv', 50, 44), btn('Create homunculus', () => run(gm.gmHomun(w, this.adminSel.homun, val('hlv', 50))))),
          row(btn('Mount + cart', () => run(gm.gmMountCart(w))), 'Rune pts +', num('rp', 10, 44), btn('Set', () => run(gm.gmRunePoints(w, val('rp', 10))))))));
      return;
    }
    if (this.adminTab === 'world') {
      const g = w.gm;
      setChildren(body, h('div', { style: 'width:400px' }, tabs, note,
        section('Cheats',
          row(onOff('God mode', w.godMode, () => run(gm.gmGodMode(w, !w.godMode))), onOff('One-hit kill', g.oneHitKill, () => run(gm.gmToggle(w, 'oneHit')))),
          row(onOff('No cooldown / free skills', g.noCooldown, () => run(gm.gmToggle(w, 'noCooldown'))), onOff('Invisible', g.invisible, () => run(gm.gmToggle(w, 'invisible')))),
          row('Move speed +%', num('spd', g.moveSpeedPct, 56), btn('Set', () => run(gm.gmMoveSpeed(w, val('spd')))), 'Game ×', num('ts', g.timeScale, 44), btn('Set', () => run(gm.gmTimeScale(w, val('ts', 1)))))),
        section('Rates (100 = normal)',
          row('EXP', num('rexp', g.expRate, 60), 'Drops', num('rdrop', g.dropRate, 60), 'Luma', num('rluma', g.lumaRate, 60), btn('Apply', () => run(gm.gmRates(w, val('rexp', 100), val('rdrop', 100), val('rluma', 100)))))),
        section('Map',
          row(sel('map2', [...d.maps.values()].map((x) => [x.id, x.name])), 'x', num('tx', 20, 44), 'y', num('ty', 20, 44), btn('Warp', () => run(gm.gmTeleportXY(w, this.adminSel.map2, val('tx', 20), val('ty', 20))))),
          row(btn('Respawn boss now', () => run(gm.gmRespawnBoss(w))), btn('Clear ground items', () => run(gm.gmClearGround(w))))),
        section('Raids & dungeons',
          row(btn('Start raid here', () => run(gm.gmRaid(w, w.map.def.id))), btn('End raid', () => run(gm.gmRaid(w, 'end')))),
          row(sel('inst', [...d.instances.values()].map((x) => [x.id, x.name])), 'Floor', num('fl', 1, 52), btn('Go', () => run(gm.gmInstanceFloor(w, this.adminSel.inst, val('fl', 1))))),
          row(btn('Reset dungeon cooldowns', () => run(gm.gmInstanceReset(w))))),
        section('Quests & auto',
          row(btn('Complete all quests', () => run(gm.gmQuestAll(w, 'complete'))), btn('Reset all quests', () => run(gm.gmQuestAll(w, 'reset')), 'btn small danger')),
          row(btn('Auto Farm', () => { w.auto.start('farm'); this.refresh(); }), btn('Auto Quest', () => { w.auto.start('quest'); this.refresh(); }), btn('Auto off', () => { w.auto.stop(); this.refresh(); })))));
      return;
    }
    if (this.adminTab === 'console') {
      const input = h('input', { id: 'gm-console', placeholder: '@help', style: 'flex:1' });
      const exec = () => {
        const line = input.value.trim(); if (!line) return;
        const cmd = line.startsWith('@') ? line : `@${line}`;
        this.adminLog.push(`> ${cmd}`);
        const r = gm.runGmCommand(w, cmd);
        this.adminLog.push(...((r.ok ? r.message : `✖ ${r.error}`) ?? '').split('\n'));
        this.adminLog = this.adminLog.slice(-120);
        this.refresh();
        (document.getElementById('gm-console') as HTMLInputElement | null)?.focus();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); exec(); } });
      const log = h('pre', { id: 'gm-console-log', style: 'height:300px;overflow:auto;font-size:11px;white-space:pre-wrap;background:rgba(0,0,0,0.3);padding:4px;margin:0 0 4px' }, this.adminLog.join('\n') || 'Type @help for every command. You can also type @commands in the chat box. Server commands (@announce, @kick, @woe…) go through the chat box while online.');
      setChildren(body, h('div', { style: 'width:400px' }, tabs, log, row(input, btn('Run', exec, 'btn small primary'))));
      log.scrollTop = log.scrollHeight;
      return;
    }
    setChildren(body, h('div', { style: 'width:400px' }, tabs, note,
      section('Character',
        row(`${c.name} · ${d.classes.get(c.classId)!.name} · Base Lv ${c.baseLevel} · Job Lv ${c.jobLevel} · ${c.luma} Luma`),
        row(btn('Full heal', () => run(gm.gmHeal(w))), btn(`God mode: ${w.godMode ? 'ON' : 'OFF'}`, () => run(gm.gmGodMode(w, !w.godMode)), w.godMode ? 'btn small primary' : 'btn small')),
        row('Base +', num('lvB', 1, 48), 'Job +', num('lvJ', 0, 48), btn('Level up', () => run(gm.gmAddLevels(w, val('lvB', 1), val('lvJ'))))),
        row('Luma', num('luma', 1000, 80), btn('Give', () => run(gm.gmGiveLuma(w, val('luma', 1000))))),
        row('Stat pts', num('sp', 5, 48), 'Skill pts', num('kp', 1, 48), btn('Give', () => run(gm.gmGivePoints(w, val('sp', 5), val('kp', 1))))),
        row('Class', sel('cls', [...d.classes.values()].map((x) => [x.id, x.name])), btn('Set class', () => run(gm.gmSetClass(w, this.adminSel.cls))))),
      section('Items',
        row(sel('item', [...d.items.values()].sort((a, b) => a.name.localeCompare(b.name)).map((x) => [x.id, `${x.name} (${x.type})`])), num('qty', 1, 48), btn('Give', () => run(gm.gmGiveItem(w, this.adminSel.item, val('qty', 1)))))),
      section('World',
        row(sel('map', [...d.maps.values()].map((x) => [x.id, x.name])), btn('Teleport', () => run(gm.gmTeleport(w, this.adminSel.map)))),
        row(sel('mon', [...d.monsters.values()].map((x) => [x.id, `${x.name} Lv.${x.level}`])), num('cnt', 3, 44), btn('Spawn near me', () => run(gm.gmSpawn(w, this.adminSel.mon, val('cnt', 3))))),
        row(btn('Defeat all monsters here', () => run(gm.gmKillAll(w))), btn('…incl. boss', () => run(gm.gmKillAll(w, true)), 'btn small danger'))),
      section('Quests',
        row(sel('quest', [...d.quests.values()].map((x) => [x.id, `${x.name}${c.quests[x.id] ? ` [${c.quests[x.id].status}]` : ''}`])),
          btn('Fill objectives', () => run(gm.gmQuest(w, this.adminSel.quest, 'complete'))), btn('Reset', () => run(gm.gmQuest(w, this.adminSel.quest, 'reset'))))),
      row(btn('Save game', () => app.saveNow(true), 'btn small primary'), btn('Toggle collision overlay', () => { app.settings.showCollision = !app.settings.showCollision; app.applySettings(); }))));
  }

  /** Called by the app's key handler while rebinding. Returns true if consumed. */
  captureKey(e: KeyboardEvent): boolean {
    if (!this.listening) return false;
    e.preventDefault();
    if (e.key !== 'Escape') {
      if (e.key === 'Shift') return true; // wait for the key pressed with it
      const key = keyFromEvent(e);
      for (const [a, k] of Object.entries(this.app.settings.keybinds)) if (k === key && a !== this.listening) this.app.settings.keybinds[a] = '';
      this.app.settings.keybinds[this.listening] = key;
      this.app.applySettings();
    }
    this.listening = null;
    this.renderSettings();
    return true;
  }

  // ---------------------------------------------------------------- dialogue
  openNpcDialog(npcId: string) {
    const w = this.app.world!;
    const npc = w.data.npcs.get(npcId)!;
    const turnIns = questsToTurnIn(w.data, w.char, npcId);
    const offers = questsOfferedBy(w.data, w.char, npcId, w.now());
    const inProgress = activeQuests(w.data, w.char).filter(({ def, prog }) => def.turnInNpc === npcId && !isComplete(def, prog, w.char));
    const opts: [string, () => void][] = [];
    for (const q of turnIns) opts.push([`✔ ${q.name} (complete)`, () => this.questDialog(npc, q, 'complete')]);
    for (const q of offers) opts.push([`! ${q.name}`, () => this.questDialog(npc, q, 'offer')]);
    for (const { def } of inProgress) opts.push([`… ${def.name}`, () => this.questDialog(npc, def, 'progress')]);
    for (const s of npc.services) {
      if (s.type === 'shop') opts.push([s.label ?? 'Shop', () => { this.closeDialog(); this.shopId = s.shopId; this.open('inventory'); this.open('shop'); }]);
      if (s.type === 'storage') opts.push(['Open storage', () => { this.closeDialog(); this.open('inventory'); this.open('storage'); }]);
      if (s.type === 'trader') opts.push(['Sell at today\'s market price', () => { this.closeDialog(); this.open('trader'); }]);
      if (s.type === 'market') opts.push(['Open the Market Hall', () => { this.closeDialog(); this.open('market'); }]);
      if (s.type === 'heal') opts.push([`Rest at the inn (${s.cost} Luma)`, () => { const r = w.healAtInn(s.cost); this.app.hud?.toast(r.ok ? r.message! : r.error, !r.ok); this.closeDialog(); }]);
      if (s.type === 'save') opts.push(['Set save point here', () => { w.setSavePoint(); this.app.saveNow(false); this.app.hud?.toast('Save point set.'); this.closeDialog(); }]);
      if (s.type === 'resetStats') opts.push([`Reset stat points${s.cost ? ` (${s.cost} Luma)` : ' (free)'}`, () => { this.closeDialog(); this.confirmAction('Reset stats', 'Refund every allocated stat point so you can spend them again?', 'Reset stats', () => w.doResetStats(s.cost)); }]);
      if (s.type === 'refine') opts.push(['Refine equipment', () => this.refineDialog(npc)]);
      if (s.type === 'enchant') opts.push(['Enchant equipment', () => { this.closeDialog(); this.enchantDialog(); }]);
      if (s.type === 'forge') opts.push(['Forge a weapon', () => { this.closeDialog(); this.forgeDialog(); }]);
      if (s.type === 'warp') opts.push(['Warp service', () => this.warpDialog(npc, s.destinations)]);
      if (s.type === 'runeReset') opts.push([`Reset the constellations (${s.cost.toLocaleString()} Luma)`, () => { this.closeDialog(); this.confirmAction('Reset runes', 'Clear every star and get all rune points back?', 'Reset', () => w.resetRunesCmd()); }]);
      if (s.type === 'stable') opts.push([w.char.flags.mountOwned ? 'You already own a war-drake' : `Buy a war-drake (${s.cost} Luma)`, () => { this.closeDialog(); w.rentMount(); }]);
      if (s.type === 'cart') opts.push([w.char.cart ? 'You already have a pushcart' : `Rent a pushcart (${s.cost} Luma)`, () => { this.closeDialog(); w.rentCart(); }]);
      // Job Masters / the Oracle list rebirth only to second jobs, the class that can use it.
      if (s.type === 'rebirth' && w.data.classes.get(w.char.classId)!.tier === 2) {
        const chk = canRebirth(w.data, w.char);
        opts.push([`Be reborn${chk.ok ? '' : ` (${chk.error})`}`, () => {
          this.closeDialog();
          if (!chk.ok) { this.app.hud?.banner('Not yet', chk.error); return; }
          this.confirmTyped('Rebirth', 'You become a High Novice at Base Level 1 with 100 stat points. Skills are reset and your gear goes back to the bag. Type REBORN to continue.', 'REBORN', 'Be reborn', () => {
            const r = w.rebirthAt();
            if (r.ok) this.app.hud?.banner('Reborn!', 'You are a High Novice. +25% HP and MP for the rest of this life.');
          });
        }]);
      }
      if (s.type === 'instance') {
        const ins = w.data.instances.get(s.instanceId)!;
        const cd = w.instanceCooldownLeft(ins.id);
        const clears = Number(w.char.flags[`instclear_${ins.id}`] ?? 0);
        opts.push([`Enter the ${ins.name}${cd > 0 ? ` (ready in ${Math.ceil(cd / 60000)} min)` : ''}`, () => {
          this.closeDialog();
          this.confirmAction(ins.name, `${ins.description} Requires Base Level ${ins.minLevel}. Leaving, dying or running out of time ends the run, and the cooldown starts when you enter.${clears ? ` You have cleared it ${clears}×.` : ''}`, 'Enter', () => w.enterInstance(ins.id));
        }]);
      }
      if (s.type === 'jobChange') for (const id of s.classIds) {
        const cls = w.data.classes.get(id)!;
        const req = cls.requirements ?? {};
        // NPCs offering many jobs (the Oracle) only list the ones open to your current class and path.
        if (s.classIds.length > 1 && (req.fromClass !== w.char.classId || (req.rebornFrom && req.rebornFrom !== w.char.flags.rebornFrom))) continue;
        opts.push([`Become a ${cls.name}${req.jobLevel ? ` (needs Job Lv ${req.jobLevel})` : ''}`, () => {
          this.closeDialog();
          this.confirmAction(`Become a ${cls.name}`, `${cls.description} Your job level resets to 1; base level, stats and learned skills are kept.`, 'Change job', () => {
            const r = w.changeJobAt(id);
            if (r.ok) this.app.hud?.banner(`You are now a ${cls.name}!`, 'New skills are available in the Skill Tree (K).');
          });
        }]);
      }
      if (s.type === 'resetSkills') opts.push([`Reset skill points${s.cost ? ` (${s.cost} Luma)` : ' (free)'}`, () => { this.closeDialog(); this.confirmAction('Reset skills', 'Forget every learned skill and refund the skill points? Hotbar skill slots are cleared.', 'Reset skills', () => w.doResetSkills(s.cost)); }]);
    }
    opts.push(['Goodbye', () => this.closeDialog()]);
    const text = npc.greeting[Math.floor(Math.random() * npc.greeting.length)];
    this.showDialog(npc, [text], opts);
  }

  /** Refine flow: pick an item, see the chance and cost, then try. */
  private refineDialog(npc: NpcDef, picked?: string, enriched = false) {
    const w = this.app.world!, d = w.data, c = w.char;
    const label = (inst: ItemInstance) => `${inst.refine ? `+${inst.refine} ` : ''}${d.items.get(inst.itemId)!.name}`;
    if (!picked) {
      const items = [...EQUIP_SLOTS.map((sl) => c.equipment[sl]).filter((i): i is ItemInstance => !!i), ...c.inventory]
        .filter((i) => { const def = d.items.get(i.itemId)!; return def.type === 'equipment' && def.slot && def.slot !== 'accessory'; });
      const opts: [string, () => void][] = items.slice(0, 8).map((i) => [`${label(i)}${Object.values(c.equipment).includes(i) ? ' (equipped)' : ''}`, () => this.refineDialog(npc, i.uid)]);
      opts.push(['Never mind', () => this.openNpcDialog(npc.id)]);
      this.showDialog(npc, [items.length ? 'Which piece shall I work on? Weapons need ore of their level (Glimmer Lv1, Bright Lv2, Starsteel Lv3–4); armor takes Moonstone Ore. Enriched ores work on any level and fail less often.' : 'You have nothing I can refine. Bring me a weapon or some armor.'], opts, null, 'Refine');
      return;
    }
    const info = refineInfo(d, c, picked, enriched);
    const inst = c.inventory.find((i) => i.uid === picked) ?? Object.values(c.equipment).find((i) => i?.uid === picked);
    if (!inst) { this.refineDialog(npc); return; }
    const pct = Math.round(info.chance * 100);
    const lines = [
      `${label(inst)} → +${info.next}`,
      `Success chance ${pct}%. Cost: 1 ${d.items.get(info.ore)?.name ?? info.ore} (you have ${countItem(c, info.ore)}) and ${info.fee.toLocaleString()} Luma.`,
      info.next > 10 ? 'Over-upgrade (+11…+20): a failure breaks the item 20% of the time, otherwise it drops 3 levels (never below +10).'
        : info.chance < 1 ? `Safe up to +${info.safe}. Past that, a failed attempt DESTROYS the item.` : `Safe refine (up to +${info.safe} never fails).`,
    ];
    const opts: [string, () => void][] = [];
    const go = () => {
      const r = w.refine(picked, enriched);
      if (r.ok) this.app.hud?.banner(r.outcome === 'success' ? `Refine success: +${r.level}` : r.outcome === 'downgraded' ? `Refine failed: now +${r.level}` : 'Refine failed', r.message!);
      if (r.ok && r.outcome !== 'broken' && (inst.refine ?? 0) < MAX_REFINE) this.refineDialog(npc, picked, enriched); else this.refineDialog(npc);
    };
    if (info.ok) opts.push([`Refine (${pct}%)`, () => (info.chance < 1 ? this.confirmTyped(
      'Risky refine', info.next > 10 ? `${label(inst)} fails ${100 - pct}% of the time: then 20% it breaks, otherwise it drops 3 levels. Type REFINE to continue.` : `${label(inst)} has a ${100 - pct}% chance to be destroyed. Type REFINE to continue.`, 'REFINE', 'Refine', go) : go())]);
    else lines.push(info.error ?? '');
    opts.push([enriched ? 'Use normal ore' : 'Use enriched ore (better odds)', () => this.refineDialog(npc, picked, !enriched)]);
    opts.push(['Choose another item', () => this.refineDialog(npc)]);
    opts.push(['Done', () => this.openNpcDialog(npc.id)]);
    this.showDialog(npc, lines, opts, null, 'Refine');
  }

  private warpDialog(npc: NpcDef, dests: { mapId: string; spawn: string; cost: number }[]) {
    const w = this.app.world!;
    const opts: [string, () => void][] = dests.map((dst) => [`${w.data.maps.get(dst.mapId)!.name} — ${dst.cost} Luma`, () => {
      const r = w.warpTo(dst.mapId);
      if (r.ok) this.closeDialog();
    }]);
    opts.push(['Never mind', () => this.openNpcDialog(npc.id)]);
    this.showDialog(npc, ['Where would you like to go? Warps are paid in advance.'], opts, null, 'Warp Service');
  }

  private questDialog(npc: NpcDef, q: QuestDef, mode: 'offer' | 'progress' | 'complete') {
    const w = this.app.world!;
    const lines = q.dialogue[mode];
    const opts: [string, () => void][] = [];
    const reward = h('div', { class: 'reward' }, `Rewards: ${rewardText(this.app, q)}`);
    if (mode === 'offer') {
      opts.push(['Accept', () => { w.accept(q.id); this.openNpcDialog(npc.id); }]);
      opts.push(['Maybe later', () => this.openNpcDialog(npc.id)]);
    } else if (mode === 'complete') {
      opts.push(['Complete quest', () => {
        const r = w.turnIn(q.id);
        if (r.ok) {
          this.app.hud?.banner('Quest Complete', q.name);
          if (r.jobChanged) this.app.hud?.banner(`You are now a ${w.data.classes.get(r.jobChanged)!.name}!`, 'New skills are available in the Skill Tree (K).');
          this.openNpcDialog(npc.id);
        }
      }]);
    } else opts.push(['I\'ll keep at it', () => this.openNpcDialog(npc.id)]);
    this.showDialog(npc, lines, opts, mode !== 'progress' ? reward : null, q.name);
  }

  private showDialog(npc: NpcDef, lines: string[], opts: [string, () => void][], extra: HTMLElement | null = null, heading?: string) {
    this.closeDialog();
    const portrait = h('canvas', { width: 96, height: 96 });
    const p = portraitFromSheet(generateCharacterSheet({ appearance: npc.appearance, outfit: npc.outfit, weapon: null, sheet: `npc/${npc.id}` }), 3);
    portrait.getContext('2d')!.drawImage(p, 0, 0);
    this.dialogEl = h('div', { class: 'panel dialog', id: 'npc-dialog' },
      portrait,
      h('div', {},
        h('div', { class: 'dn' }, npc.name), h('div', { class: 'dt' }, heading ? `${npc.title} — ${heading}` : npc.title),
        h('div', { class: 'dtext' }, lines.map((l) => h('p', { style: 'margin:0 0 4px' }, l))),
        extra,
        h('div', { class: 'dopts' }, opts.map(([label, fn], i) => h('div', { class: 'dopt', dataset: { opt: String(i) }, onclick: () => { audio.play('ui_click'); fn(); } }, `${i + 1}. ${label}`)))));
    this.root.appendChild(this.dialogEl);
  }

  showObjectText(name: string, text: string) {
    this.closeDialog();
    this.dialogEl = h('div', { class: 'panel dialog', style: 'grid-template-columns:1fr' },
      h('div', {}, h('div', { class: 'dn' }, name), h('div', { class: 'dtext' }, text),
        h('div', { class: 'dopts' }, h('div', { class: 'dopt', onclick: () => this.closeDialog() }, 'Close'))));
    this.root.appendChild(this.dialogEl);
  }

  /** Number keys pick dialogue options. */
  dialogKey(n: number): boolean {
    if (!this.dialogEl) return false;
    const opt = this.dialogEl.querySelector(`[data-opt="${n - 1}"]`) as HTMLElement | null;
    opt?.click();
    return !!opt;
  }
  get dialogOpen() { return !!this.dialogEl; }
  closeDialog() { this.dialogEl?.remove(); this.dialogEl = null; }

  // ---------------------------------------------------------------- modal
  showModal(title: string, text: string, buttons: [string, () => void][], dismissable = false) {
    this.modal(title, [h('p', {}, text)], buttons.map(([l, fn]) => [l, () => { this.closeModal(); fn(); }]), dismissable);
  }

  private modal(title: string, body: HTMLElement[], buttons: [string, () => void][], dismissable: boolean) {
    this.closeModal();
    this.modalEl = h('div', { class: 'modal-back', dataset: { dismissable: dismissable ? '1' : '0' } },
      h('div', { class: 'panel modal col', style: 'align-items:center' }, h('h3', {}, title), body,
        h('div', { class: 'row', style: 'justify-content:center;margin-top:8px' }, buttons.map(([l, fn], i) => h('button', { class: `btn${i === 0 ? ' primary' : ''}`, onclick: fn }, l)))));
    this.root.appendChild(this.modalEl);
  }
  closeModal() { this.modalEl?.remove(); this.modalEl = null; }

  // ---------------------------------------------------------------- shop
  private renderShop() {
    const w = this.app.world!;
    const body = this.wins.get('shop')!.body;
    const shop = this.shopId ? w.data.shops.get(this.shopId) : null;
    if (!shop) { setChildren(body, 'No shop open.'); return; }
    const rows = shopStock(w.data, shop, w.now()).map((id) => {
      const def = w.data.items.get(id)!;
      const qty = h('input', { type: 'number', min: 1, max: 99, value: 1 });
      const icon = h('img', { src: itemIconUrl(def) });
      icon.addEventListener('mousemove', (e) => this.showTooltip(e, this.itemTooltip(def)));
      icon.addEventListener('mouseleave', () => this.hideTooltip());
      const usable = def.type !== 'equipment' || canEquip(w.data, w.char, def).ok;
      return h('div', { class: 'shop-row', dataset: { item: id } }, icon,
        h('div', {}, h('div', { style: { color: RARITY_COLOR[def.rarity] } }, def.name), h('div', { class: usable ? 'muted' : 'bad', style: 'font-size:10px' }, def.type === 'equipment' ? (usable ? 'Can equip' : 'Cannot equip yet') : def.description)),
        shop.market
          ? h('div', { class: 'gold', style: 'text-align:right' }, `${traderBuyPrice(w.data, w.char, id, w.now()).toLocaleString()} L`, h('div', { style: 'font-size:10px' }, this.pctArrow(priceChangePct(w.data, w.char, id, w.now(), 'buy'))))
          : h('div', { class: 'gold' }, buyPrice(w.data, w.char, id) < def.price ? h('span', { title: `Discount (list price ${def.price})` }, `${buyPrice(w.data, w.char, id)} L`) : `${def.price} L`), qty,
        h('button', { class: 'btn small', onclick: () => w.buy(shop.id, id, Math.floor(Number(qty.value) || 1)) }, 'Buy'));
    });
    setChildren(body,
      h('div', { style: 'width:420px' },
        h('div', { class: 'row' }, h('span', { class: 'gold', style: 'font-weight:bold' }, shop.name), h('span', { class: 'spacer' }), h('span', {}, `You have ${w.char.luma.toLocaleString()} Luma`)),
        shop.market ? h('div', { class: 'muted', style: 'font-size:11px;margin-top:4px' }, `Market prices: they change every hour, and buying a lot of one item raises its price for a few hours. New wares in ${Math.ceil(nextRestockMs(w.now()) / 60000)} min (every 2 hours, gear of every level). See the graph in the Market Trader window.`) : '',
        h('div', { style: 'max-height:380px;overflow:auto;margin-top:6px' }, rows),
        h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, `To sell: right-click an item in your inventory and choose Sell (${sellPrice(w.data, 'red_potion', w.char) > sellPrice(w.data, 'red_potion') ? '50% of its value + Overcharge' : '50% of its value'}).`)));
  }

  // ---------------------------------------------------------------- storage
  private renderStorage() {
    const w = this.app.world!;
    const body = this.wins.get('storage')!.body;
    const grid = h('div', { class: 'inv-grid' });
    const slots = w.data.balance.economy.storageSlots;
    for (let i = 0; i < Math.min(slots, 60); i++) {
      const inst = w.char.storage[i];
      const el = h('div', { class: 'islot' });
      if (inst) {
        const def = w.data.items.get(inst.itemId)!;
        el.append(h('img', { src: itemIconUrl(def) }), inst.qty > 1 ? h('span', { class: 'q' }, String(inst.qty)) : '');
        el.addEventListener('mousemove', (e) => this.showTooltip(e, this.itemTooltip(def, inst)));
        el.addEventListener('mouseleave', () => this.hideTooltip());
        el.addEventListener('dblclick', () => this.qtyPrompt(inst, 'Withdraw how many?', (n) => w.withdraw(inst.uid, n)));
      }
      grid.appendChild(el);
    }
    grid.addEventListener('dragover', (e) => e.preventDefault());
    grid.addEventListener('drop', (e) => {
      const d = getDragData(e);
      if (d?.type !== 'inv') return;
      e.preventDefault();
      const inst = w.char.inventory.find((x) => x.uid === d.id);
      if (inst) this.qtyPrompt(inst, 'Store how many?', (n) => w.deposit(inst.uid, n));
    });
    setChildren(body,
      h('div', { class: 'row', style: 'margin-bottom:6px' }, h('span', {}, `Stored ${w.char.storage.length}/${slots}`), h('span', { class: 'spacer' }),
        h('span', { class: 'muted', style: 'font-size:11px' }, `Fee ${w.data.balance.economy.storageFee} Luma per deposit`)),
      grid,
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, 'Drag items from your inventory here to store them · Double-click to withdraw'));
  }
}

export function rewardText(app: App, q: QuestDef): string {
  const d = app.data;
  const r = q.rewards;
  return [
    r.exp ? `${r.exp} Base EXP` : '', r.jobExp ? `${r.jobExp} Job EXP` : '', r.luma ? `${r.luma} Luma` : '',
    ...(r.items ?? []).map((i) => `${d.items.get(i.itemId)?.name} ×${i.qty}`),
    r.jobChange ? `Job change: ${d.classes.get(r.jobChange)?.name}` : '',
  ].filter(Boolean).join(', ') || '—';
}
