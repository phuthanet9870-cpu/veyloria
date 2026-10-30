// Shared data model for Veyloria Online.
// Static game data (definitions) is kept separate from player data (state).

export type Element =
  | 'neutral' | 'fire' | 'water' | 'wind' | 'earth'
  | 'holy' | 'shadow' | 'poison' | 'undead' | 'ghost';

export const ELEMENTS: Element[] = [
  'neutral', 'fire', 'water', 'wind', 'earth', 'holy', 'shadow', 'poison', 'undead', 'ghost',
];

export type StatKey = 'str' | 'agi' | 'vit' | 'int' | 'dex' | 'luk';
export const STAT_KEYS: StatKey[] = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
export type BaseStats = Record<StatKey, number>;

export type StatusId =
  | 'poison' | 'burn' | 'freeze' | 'stun' | 'silence'
  | 'slow' | 'blind' | 'bleed' | 'sleep' | 'curse';

export type Direction = 'down' | 'up' | 'left' | 'right';

// ---------------------------------------------------------------- modifiers
/** Flat or percent bonuses granted by equipment, buffs, passives, cards, runes. */
export interface StatModifiers {
  str?: number; agi?: number; vit?: number; int?: number; dex?: number; luk?: number;
  maxHp?: number; maxMp?: number; maxHpPct?: number; maxMpPct?: number;
  patk?: number; matk?: number; patkPct?: number; matkPct?: number;
  pdef?: number; mdef?: number; pdefPct?: number;
  hit?: number; flee?: number; crit?: number; critDmg?: number;
  aspdPct?: number; moveSpeedPct?: number; castTimePct?: number; cdrPct?: number;
  hpRegen?: number; mpRegen?: number;
  /** % bonus damage by element of the attack. */
  elementDamagePct?: Partial<Record<Element, number>>;
  /** % damage reduction against attacks of an element. */
  elementResistPct?: Partial<Record<Element, number>>;
  /** % bonus damage against monsters of a race / size (cards). */
  raceDamagePct?: Partial<Record<string, number>>;
  sizeDamagePct?: Partial<Record<string, number>>;
  /** % damage reduction against attackers of a race (cards). */
  raceResistPct?: Partial<Record<string, number>>;
  /** % chance to completely avoid a physical hit (on top of FLEE). */
  perfectDodge?: number;
  /** % chance per basic attack to inflict a status on the target (cards / options). */
  onHitStatusPct?: Partial<Record<string, number>>;
  /** % of basic-attack damage returned as HP. */
  hpDrainPct?: number;
  /** % chance for a dagger basic attack to strike twice. */
  doubleAttackPct?: number;
  /** % off NPC shop prices / % more when selling to NPCs. */
  discountPct?: number;
  overchargePct?: number;
  weightLimit?: number;
  attackRange?: number;
  /** % chance to counter a melee hit with a basic attack. */
  counterChance?: number;
  /** % of incoming damage redirected to MP. */
  damageToMpPct?: number;
  /** >0 = hidden from monsters until the holder attacks. */
  stealth?: number;
}

// ---------------------------------------------------------------- classes
export interface JobClassDef {
  id: string;
  name: string;
  /** 0 Novice, 1 first job, 2 second job, 3 transcendent. */
  tier: 0 | 1 | 2 | 3;
  role: string;
  description: string;
  parent?: string;
  /** Reborn classes keep the skills and gear rights of this class (and its lineage). */
  inherits?: string;
  /** Transcendent bonus: max HP/MP multiplier. */
  hpMpMul?: number;
  maxJobLevel: number;
  hpPerLevel: number;
  mpPerLevel: number;
  baseAttackIntervalMs: number;
  weaponTypes: string[];
  skills: string[];
  /** Requirements to change into this job. */
  requirements?: { jobLevel?: number; baseLevel?: number; fromClass?: string; questId?: string; rebornFrom?: string };
  /** Job bonus stats: character N (s/a/v/i/d/l or '.') is the stat gained at job level N+1. */
  jobBonus?: string;
  /** Extra carrying capacity for this job. */
  weightBonus?: number;
  /** Where this job's guild master stands (generated second jobs). */
  guildMaster?: { town: string; name: string; title: string };
  outfit: { primary: string; secondary: string; accent: string; style: string };
}

// ---------------------------------------------------------------- skills
export type SkillTargeting = 'enemy' | 'self' | 'ground' | 'ally' | 'passive';

export type SkillEffect =
  | { type: 'damage'; kind: 'physical' | 'magic'; multiplier: number; perLevel: number;
      element?: Element | 'weapon'; hits?: number; radius?: number; ignoreDefPct?: number; alwaysHit?: boolean }
  | { type: 'heal'; base: number; perLevel: number; intScale: number; radius?: number }
  | { type: 'status'; status: StatusId; chance: number; perLevel?: number; durationMs: number; radius?: number }
  | { type: 'buff'; buffId: string; durationMs: number; perLevelMs?: number; mods: StatModifiers;
      modsPerLevel?: StatModifiers; radius?: number; flags?: string[] }
  | { type: 'knockback'; distance: number }
  | { type: 'taunt'; radius: number }
  | { type: 'groundZone'; zoneId: string; durationMs: number; radius: number; tickMs: number;
      kind: 'physical' | 'magic'; multiplier: number; perLevel: number; element: Element;
      status?: StatusId; statusChance?: number; statusDurationMs?: number }
  | { type: 'dash'; distance: number }
  | { type: 'cure'; statuses: StatusId[] }
  /** Give the caster's weapon an element for a while (Sage-style endow). */
  | { type: 'endow'; element: Element; durationMs: number; perLevelMs?: number }
  /** Try to take one item from the target's drop table (once per monster). */
  | { type: 'steal'; chance: number; perLevel: number }
  /** Pocket Luma from the target: level × (skill level × perLevel + LUK / 10), once per monster. */
  | { type: 'mug'; perLevel: number }
  | { type: 'line'; length: number; width: number };

export interface SkillDef {
  id: string;
  name: string;
  classId: string;
  description: string;
  kind: 'active' | 'passive' | 'buff' | 'ultimate';
  targeting: SkillTargeting;
  maxLevel: number;
  range: number;
  mpCost: number;
  mpCostPerLevel: number;
  castTimeMs: number;
  cooldownMs: number;
  element?: Element;
  requires?: { skillId: string; level: number }[];
  requiresJobLevel?: number;
  /** Weapon types required to use the skill (e.g. bows for archery skills). */
  requiresWeapon?: string[];
  /** Luma spent per use (e.g. a coin-powered strike). */
  lumaCost?: number;
  lumaCostPerLevel?: number;
  /** Passive bonuses applied permanently per skill level. */
  passive?: StatModifiers;
  effects: SkillEffect[];
  fx: string;
  icon: { glyph: string; color: string };
}

// ---------------------------------------------------------------- items
export type EquipSlot =
  | 'weapon' | 'armor' | 'headgear' | 'shield' | 'garment' | 'boots' | 'accessory1' | 'accessory2';
export const EQUIP_SLOTS: EquipSlot[] = [
  'weapon', 'armor', 'headgear', 'shield', 'garment', 'boots', 'accessory1', 'accessory2',
];

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ItemType = 'consumable' | 'equipment' | 'material' | 'quest' | 'card' | 'misc';

export type UseEffect =
  | { type: 'heal'; hp?: number; mp?: number; hpPct?: number; mpPct?: number }
  | { type: 'cure'; statuses: StatusId[] }
  | { type: 'buff'; buffId: string; durationMs: number; mods: StatModifiers }
  | { type: 'returnToSave' }
  | { type: 'randomTeleport' }
  /** Temporarily gives the weapon an element (like an elemental converter). */
  | { type: 'endow'; element: Element; durationMs: number }
  /** Opens into a random non-boss card. */
  | { type: 'randomCard' }
  | { type: 'resetStats' }
  | { type: 'resetSkills' }
  /** Thrown at the current target (or the nearest monster): damage + base level × perLevel, optional splash and status. */
  | { type: 'throw'; element: Element; damage: number; perLevel: number; radius?: number; status?: StatusId; statusChance?: number };

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  description: string;
  weight: number;
  price: number;
  stackable: boolean;
  maxStack: number;
  bound?: boolean;
  icon: { shape: string; color: string; accent?: string };
  // equipment
  slot?: 'weapon' | 'armor' | 'headgear' | 'shield' | 'garment' | 'boots' | 'accessory';
  weaponType?: string;
  /** Weapon level 1–4 (Ragnarok-style): sets refine safety, ATK per refine and ore grade. */
  weaponLevel?: number;
  twoHanded?: boolean;
  attackKind?: 'melee' | 'ranged' | 'magic';
  attackRange?: number;
  attackIntervalPct?: number;
  element?: Element;
  equipLevel?: number;
  classes?: string[];
  mods?: StatModifiers;
  cardSlots?: number;
  /** Card items: which equipment slot they compound into, and what they add. */
  card?: { equip: 'weapon' | 'armor' | 'headgear' | 'shield' | 'garment' | 'boots' | 'accessory'; mods: StatModifiers; monsterId: string; autocast?: Autocast };
  /** Equipment that casts a skill by itself on basic-attack hits. */
  autocast?: Autocast;
  /** Pets: this item tames that monster / is that pet's egg / is pet food. */
  lure?: string;
  petEgg?: string;
  petFood?: boolean;
  petAccessory?: string;
  // consumables
  use?: UseEffect[];
  cooldownMs?: number;
}

export interface ItemInstance {
  uid: string;
  itemId: string;
  qty: number;
  refine?: number;
  cards?: string[];
  /** Forged weapons: element from an element stone, maker's name, star crumbs (bonus ATK). */
  element?: Element;
  crafter?: string;
  starCrumbs?: number;
  /** Random options (affixes) rolled on drops or added by an enchanter. */
  options?: { key: string; value: number }[];
  locked?: boolean;
  bound?: boolean;
  /** A pet egg remembers its pet. */
  pet?: PetState;
}

/** Ragnarok-style autocast: chancePct per basic-attack hit to cast skillId at level, for free. */
export interface Autocast { skillId: string; level: number; chancePct: number }

/** Item/card combo: all parts equipped (or compounded into equipped items) grants mods. */
export interface ComboDef { id: string; name: string; parts: string[]; mods: StatModifiers }

/** Memorial dungeon (timed instance): floors cleared in order within a time limit; entry cooldown in real time. */
export interface InstanceDef {
  id: string; name: string; description: string; minLevel: number;
  timeLimitMs: number; cooldownMs: number;
  floors: string[]; exitMap: string;
  reward: InstanceReward;
  /** Partial rewards for clearing certain floors (e.g. 25 / 50 / 75 of the Spire). */
  milestones?: { floor: number; reward: InstanceReward }[];
}
export interface InstanceReward { exp: number; jobExp: number; luma: number; items: { itemId: string; qty: number }[] }

// ---------------------------------------------------------------- pets
/** Ragnarok-style pet: tamed from a monster with its lure item. */
export interface PetDef {
  id: string;
  monsterId: string;
  name: string;
  lureItem: string;
  eggItem: string;
  foodItem: string;
  /** Base capture rate in 1/100 of a percent (2000 = 20%). */
  captureRate: number;
  /** Hunger lost every hungerTickMs. */
  fullness: number;
  hungerTickMs: number;
  intimacyStart: number;
  intimacyFed: number;
  intimacyOverfed: number;
  intimacyHungry: number;
  intimacyOwnerDie: number;
  /** Bonus while the pet is Loyal. */
  loyalBonus: StatModifiers;
  loyalText: string;
  accessoryItem?: string;
  /** Evolution: Loyal pet + materials → stronger form (loyal bonus ×1.5). */
  evolution?: { name: string; materials: { itemId: string; qty: number }[] };
}

export interface HomunculusState { typeId: string; name: string; level: number; exp: number; hp: number; hunger: number; intimacy: number; alive: boolean; out: boolean; evolved: boolean; nextHungerAt?: number }

export interface PetState { petId: string; name: string; hunger: number; intimacy: number; nextHungerAt?: number; accessory?: string; evolved?: boolean }

// ---------------------------------------------------------------- monsters
export type AiType = 'passive' | 'aggressive' | 'assist' | 'ranged' | 'magic' | 'elite' | 'boss';

export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  element: Element;
  /** Element level 1–4 (Ragnarok-style): higher levels resist more and change the matchups. */
  elementLevel?: number;
  /** Picks up items lying on the ground and drops them when killed. */
  looter?: boolean;
  /** Field mini-boss (tougher, rarer, better drops). */
  elite?: boolean;
  race: string;
  size: 'small' | 'medium' | 'large';
  maxHp: number;
  attack: number;
  magicAttack?: number;
  defense: number;
  magicDefense?: number;
  hit?: number;
  flee?: number;
  exp: number;
  jobExp: number;
  attackRange: number;
  attackIntervalMs: number;
  moveSpeed: number;
  aggroRange?: number;
  leashRange?: number;
  aiType: AiType;
  /** Optional extra behaviour flags (e.g. assist for passive slimes). */
  aiFlags?: string[];
  respawnSeconds: number;
  dropTableId: string;
  projectile?: { element: Element; color: string };
  onHitStatus?: { status: StatusId; chance: number; durationMs: number };
  statusImmune?: StatusId[];
  bossId?: string;
  art: { shape: string; w: number; h: number; colors: string[]; scale?: number };
  collisionRadius: number;
}

export interface DropEntry { itemId: string; chance: number; min?: number; max?: number }
export interface DropTable { id: string; entries: DropEntry[]; luma?: [number, number] }

export interface BossSkillDef {
  id: string;
  name: string;
  kind: 'circle' | 'cone' | 'self_circle' | 'summon' | 'charge' | 'ring';
  telegraphMs: number;
  radius?: number;
  multiplier?: number;
  element?: Element;
  status?: { status: StatusId; chance: number; durationMs: number };
  summon?: { monsterId: string; count: number };
  cooldownMs: number;
  minPhase: number;
  fx: string;
}

export interface BossDef {
  id: string;
  monsterId: string;
  title: string;
  intro: string;
  phases: { hpPct: number; name: string; atkMul: number; speedMul: number; message: string }[];
  enrage: { afterMs: number; hpPct: number; atkMul: number; aspdMul: number };
  skills: BossSkillDef[];
  contributionRewards: { minDamagePct: number; items: { itemId: string; qty: number }[]; luma: number };
  /** MVP: bonus EXP (% of the boss's base EXP) and independent item rolls for the top damage dealer. */
  mvp?: { expPct: number; items: { itemId: string; chance: number }[] };
}

// ---------------------------------------------------------------- statuses / buffs
export interface StatusDef {
  id: StatusId;
  name: string;
  description: string;
  defaultDurationMs: number;
  stackLimit: number;
  /** Damage over time: fraction of max HP per tick, plus flat amount. */
  dot?: { pctMaxHp: number; flat: number; tickMs: number; element: Element; canKill: boolean };
  preventsMove?: boolean;
  preventsAction?: boolean;
  preventsSkills?: boolean;
  breaksOnDamage?: boolean;
  mods?: StatModifiers;
  /** Stat that reduces chance & duration: chance *= (1 - stat * resistPerPoint). */
  resistStat?: StatKey;
  resistPerPoint?: number;
  /** Elements/races immune to it. */
  immuneElements?: Element[];
  curedBy: string[];
  color: string;
}

// ---------------------------------------------------------------- maps
export interface Rect { x: number; y: number; w: number; h: number }

export type PaintOp =
  | { op: 'rect'; tile: string; x: number; y: number; w: number; h: number; layer?: 'ground' | 'deco' | 'wall' }
  | { op: 'path'; tile: string; points: [number, number][]; width: number }
  | { op: 'building'; x: number; y: number; w: number; h: number; style: string; door?: number; sign?: string }
  | { op: 'object'; kind: string; x: number; y: number; id?: string }
  | { op: 'fence'; x: number; y: number; length: number; dir: 'h' | 'v' }
  | { op: 'clear'; x: number; y: number; w: number; h: number }
  | { op: 'scatter'; kind: string; area?: Rect; density: number; seed: number }
  | { op: 'blob'; tile: string; cx: number; cy: number; rx: number; ry: number; layer?: 'ground' | 'wall'; seed?: number };

export interface PortalDef {
  id: string;
  x: number; y: number; w: number; h: number;
  targetMap: string;
  targetSpawn: string;
  label: string;
}

export interface MonsterSpawnDef {
  monsterId: string;
  count: number;
  area: Rect;
}

export interface MapObjectDef {
  id: string;
  kind: string;
  x: number; y: number;
  name: string;
  interact?: { text: string; questFlag?: string; giveItem?: { itemId: string; qty: number } };
}

export interface MapDef {
  id: string;
  /** How far a widened map's original content was shifted (tiles); set by the world generator. */
  origin?: { x: number; y: number };
  name: string;
  region: string;
  type: 'town' | 'field' | 'dungeon' | 'boss' | 'instance' | 'arena';
  /** Memorial-dungeon floors: which instance and which floor (1-based). */
  instanceId?: string;
  floor?: number;
  levelRange?: [number, number];
  width: number;
  height: number;
  tileset: string;
  /** Authored visual parts anchored by left x / bottom y, in world tile units.
   * Walkability is defined by paint, never by these decorative overlays. */
  scenery?: { kind: string; x: number; y: number; w: number; h: number; opening?: number; depth?: number }[];
  base: string;
  border: { kind: string; thickness: number };
  bgm: string;
  ambient: string;
  weather: string[];
  isSavePoint?: boolean;
  worldMapPos: { x: number; y: number };
  paint: PaintOp[];
  portals: PortalDef[];
  spawnPoints: Record<string, { x: number; y: number }>;
  npcs: { npcId: string; x: number; y: number; facing?: Direction }[];
  monsterSpawns: MonsterSpawnDef[];
  bossSpawn?: { bossId: string; x: number; y: number; respawnSeconds: number };
  objects: MapObjectDef[];
  areas: { id: string; name: string; rect: Rect; label?: { x: number; y: number } }[];
}

export interface TileDef {
  id: string;
  layer: 'ground' | 'deco' | 'wall' | 'above';
  walkable: boolean;
  draw: string;
}

export interface TilesetDef {
  id: string;
  name: string;
  palette: Record<string, string>;
}

/** World object kinds: trees, rocks, crates... Rendered y-sorted, block a footprint. */
export interface ObjectKindDef {
  id: string;
  footprint: { w: number; h: number };
  blocks: boolean;
  draw: string;
  spriteW: number;
  spriteH: number;
}

// ---------------------------------------------------------------- npcs & quests
export interface NpcDef {
  id: string;
  name: string;
  title: string;
  appearance: Appearance;
  outfit: { primary: string; secondary: string; accent: string; style: string };
  greeting: string[];
  services: NpcService[];
}

export type NpcService =
  | { type: 'shop'; shopId: string; label?: string }
  | { type: 'storage' }
  /** Market Trader: buys anything at today's market price (moves every hour). */
  | { type: 'trader' }
  /** Market Hall: the player-to-player market (online). */
  | { type: 'market' }
  | { type: 'heal'; cost: number }
  | { type: 'jobChange'; classIds: string[] }
  | { type: 'rebirth' }
  /** Rent a war-drake mount (Knight line). */
  | { type: 'stable'; cost: number }
  /** Rent a pushcart (Merchant line). */
  | { type: 'cart'; cost: number }
  /** Reset the Rune Constellation. */
  | { type: 'runeReset'; cost: number }
  | { type: 'instance'; instanceId: string }
  | { type: 'refine' }
  | { type: 'forge' }
  | { type: 'enchant' }
  | { type: 'warp'; destinations: { mapId: string; spawn: string; cost: number }[] }
  | { type: 'resetStats'; cost: number }
  | { type: 'resetSkills'; cost: number }
  | { type: 'save' };

export interface ShopDef { id: string; name: string; items: string[]; /** Market Trader stock: prices move every hour. */ market?: boolean; /** `items` is a pool; the shop shows a random pick from every tier, re-rolled every 2 hours. */ rotating?: boolean }

/** Forging recipe (Ragnarok-style blacksmith forging, done at a forge NPC). */
export interface RecipeDef { id: string; itemId: string; materials: { itemId: string; qty: number }[]; fee: number }

export type QuestObjective =
  | { type: 'talk'; npcId: string; label: string }
  | { type: 'kill'; monsterId: string; count: number; label: string }
  | { type: 'collect'; itemId: string; count: number; label: string }
  | { type: 'deliver'; itemId: string; count: number; npcId: string; label: string }
  | { type: 'explore'; mapId: string; areaId?: string; label: string }
  | { type: 'defeatBoss'; bossId: string; label: string }
  | { type: 'interact'; objectId: string; label: string }
  | { type: 'craft'; itemId: string; count: number; label: string }
  | { type: 'buy'; slot?: EquipSlot; itemId?: string; label: string }
  | { type: 'equip'; slot: EquipSlot; label: string }
  | { type: 'refine'; level: number; label: string }
  | { type: 'reachLevel'; jobLevel?: number; baseLevel?: number; label: string };

export interface QuestDef {
  id: string;
  name: string;
  category: 'tutorial' | 'main' | 'side' | 'job' | 'daily' | 'event';
  chapter?: number;
  giverNpc: string;
  turnInNpc: string;
  summary: string;
  prerequisites: { quests?: string[]; baseLevel?: number; jobLevel?: number; classes?: string[]; notClasses?: string[] };
  objectives: QuestObjective[];
  rewards: { exp?: number; jobExp?: number; luma?: number; items?: { itemId: string; qty: number }[]; jobChange?: string; flags?: string[] };
  dialogue: { offer: string[]; progress: string[]; complete: string[] };
  repeatable?: 'daily';
  /** Items consumed on turn-in (defaults to collect/deliver objectives). */
  consumeItems?: boolean;
}

// ---------------------------------------------------------------- player state
export interface Appearance {
  body: 'a' | 'b';
  hairStyle: 'short' | 'long' | 'spiky' | 'ponytail' | 'bob';
  hairColor: string;
  eyeColor: string;
  skinTone: string;
}

export type QuestStatus = 'active' | 'ready' | 'completed';
export interface QuestProgress {
  questId: string;
  status: QuestStatus;
  counts: number[];
  acceptedAt: number;
  completedAt?: number;
}

export interface HotbarSlot { type: 'skill' | 'item'; id: string }

export interface CharacterState {
  id: string;
  name: string;
  createdAt: number;
  appearance: Appearance;
  classId: string;
  classHistory: string[];
  baseLevel: number;
  jobLevel: number;
  baseExp: number;
  jobExp: number;
  statPoints: number;
  skillPoints: number;
  stats: BaseStats;
  skills: Record<string, number>;
  hp: number;
  mp: number;
  luma: number;
  inventory: ItemInstance[];
  equipment: Partial<Record<EquipSlot, ItemInstance>>;
  storage: ItemInstance[];
  quests: Record<string, QuestProgress>;
  flags: Record<string, boolean | number | string>;
  position: { mapId: string; x: number; y: number };
  savePoint: { mapId: string; spawn: string };
  hotbar: (HotbarSlot | null)[];
  /** The pet that is out (hatched); null/undefined when it is in its egg. */
  pet?: PetState | null;
  /** Alchemist's homunculus. */
  homunculus?: HomunculusState | null;
  /** Rune Constellation ranks by star id. */
  runes?: Record<string, number>;
  /** Merchant pushcart contents (undefined/null = no cart). */
  cart?: ItemInstance[] | null;
  stats_meta: { kills: number; deaths: number; playTimeMs: number; bossKills: Record<string, number> };
  /** What this character sold to Market Traders: item id → [hour index, qty] (last 48 h). Lowers that item's price for a while. */
  marketSales?: Record<string, [number, number][]>;
  /** What this character bought from Market Traders (same format). Raises that item's price for a while. */
  marketBuys?: Record<string, [number, number][]>;
  /** Achievements earned: id → time. */
  achievements?: Record<string, number>;
  /** Title shown under the name (an achievement id). */
  title?: string;
  /** Daily login rewards: last claimed day (YYYY-MM-DD, local time) and the streak (1–7). */
  daily?: { lastDay: string; streak: number };
}

export interface Settings {
  volume: { master: number; music: number; sfx: number; ambient: number };
  keybinds: Record<string, string>;
  showDamageNumbers: boolean;
  autoLoot: boolean;
  showCollision: boolean;
  /** Ragnarok-style square under the mouse (default on). */
  cellCursor?: boolean;
  /** Virtual joystick and action buttons; undefined = on for touch screens. */
  touchControls?: boolean;
  /** Faint grid lines over the map (default off). */
  showGrid?: boolean;
  /** Camera zoom (0.75–2.5, default 1.5). */
  zoom?: number;
  /** Visual effects: skill/hit effects, particles, weather, flashes (default off). */
  effects?: boolean;
  /** The bottom-right icon menu is folded away. */
  menuCollapsed?: boolean;
  wasdMovement: boolean;
  /** Interface language (default English). */
  language?: 'en' | 'th';
  /** Online play: last server address and account name used. */
  serverUrl?: string;
  serverUser?: string;
}

export interface SaveFile {
  version: number;
  savedAt: number;
  account: { id: string; name: string; createdAt: number; maxSlots: number };
  characters: (CharacterState | null)[];
  settings: Settings;
}

export interface DerivedStats {
  maxHp: number; maxMp: number;
  patk: number; matk: number; pdef: number; mdef: number;
  hit: number; flee: number; crit: number; critDmg: number;
  attackIntervalMs: number; moveSpeed: number;
  /** Ragnarok-style ASPD (0–190): 200 − attack delay / 20 ms. */
  aspd: number;
  doubleAttackPct: number;
  autocasts: Autocast[];
  /** Combos currently active. */
  activeCombos: string[];
  /** Stats granted by job level (shown as +N in the status window). */
  jobBonusStats: BaseStats;
  castTimeMul: number; cdrPct: number;
  hpRegen: number; mpRegen: number;
  attackRange: number; attackKind: 'melee' | 'ranged' | 'magic';
  weaponElement: Element;
  weightLimit: number;
  elementDamagePct: Partial<Record<Element, number>>;
  elementResistPct: Partial<Record<Element, number>>;
  raceDamagePct: Partial<Record<string, number>>;
  sizeDamagePct: Partial<Record<string, number>>;
  raceResistPct: Partial<Record<string, number>>;
  perfectDodge: number;
  onHitStatusPct: Partial<Record<string, number>>;
  hpDrainPct: number;
  /** Weapon type for the size table ('unarmed' without a weapon). */
  weaponType: string;
  totalStats: BaseStats;
}
