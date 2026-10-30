# VEYLORIA ONLINE: *Legends Begin With You*

A 2D fantasy MMORPG with a top-down 3/4 view. It's built with TypeScript, Phaser 3 (WebGL), HTML/CSS UI and Vite.

> **Status: Phase 1 (Playable Game Foundation): done and tested in single-player development mode.**
> **Environment art:** all 136 maps use generated terrain and prop atlases across 21 themes, with connected tile variants and automatic edge blending. Characters, icons, effects and audio remain procedural. See [environment artwork](docs/ENVIRONMENT_ART.md).
> Online play includes a prototype WebSocket server; characters and inventory are still client-owned.

## ภาพรวม (Thai summary)
- **เปลี่ยนภาษาได้ อังกฤษ / ไทย** ที่มุมขวาบนของหน้าแรก หรือ ตั้งค่า → ภาษา ในเกม (ชื่อไอเทม มอนสเตอร์ สกิล แผนที่ คงเป็นภาษาอังกฤษ)
- **หน้าจอแบบใหม่:** สถานะมุมซ้ายบน · มินิแมพมีแถบซูม (ล้อเมาส์ / ปุ่ม + − ก็ซูมได้) · ฮอตบาร์ 2 แถว (1–0 และ Shift+1–0) · ปุ่ม AUTO ข้างฮอตบาร์กดแล้วฟาร์มทันที, ⚙ = ตั้งค่าออโต้ · เควสออโต้อยู่ในช่องเควส · เมนูไอคอน 5 คอลัมน์ ย่อได้ด้วยปุ่ม ▼ เมนู · คลิกไอเทมแล้วมีปุ่ม "สวมใส่"
- **ตลาดและการซื้อขาย:** **Trader Moss** (Willowbrook) เป็นพ่อค้าตลาดคนเดียวและมีกราฟที่นี่ที่เดียว รับซื้อทุกอย่างได้เงินทันที ของที่ขายสุ่มเปลี่ยนทุก 2 ชั่วโมง (อุปกรณ์ทุกระดับเลเวล + ยา) ราคาซื้อและราคาขายขึ้นลงทุก 1 ชั่วโมง (ของหายากแกว่งแรงกว่า ขายเยอะราคารับซื้อตก ซื้อเยอะราคาขายขึ้น) · เมืองอื่นมีพ่อค้าสินค้าทั่วไปราคาคงที่ · NPC **ตลาดกลาง** วางขายของให้ผู้เล่นจริงเท่านั้นที่ซื้อ (ต้องต่อเซิร์ฟเวอร์) ได้เงินแม้ออฟไลน์ · **คลิกผู้เล่นอื่น** เพื่อเทรด ชวนปาร์ตี้/กิลด์ กระซิบ
- **ความสะดวก:** เอาเมาส์ชี้อุปกรณ์จะ **เทียบกับของที่ใส่อยู่** (ATK/DEF ▲▼) · **ความสำเร็จ 23 อย่าง** พร้อมรางวัลและ **ฉายา** ใต้ชื่อ (🏆) · **ล็อกอินรายวัน** ปฏิทิน 7 วัน (🎁) · **อีเวนต์ตามเวลา** EXP +50% ช่วง 12–13 น. และ 20–22 น., ดรอป +50% วันเสาร์-อาทิตย์ · **Alchemist ปรุงยา** (ยาแดง/ส้ม/เหลือง/เขียว/ฟ้า, ขวดไฟ, ขวดกรด) ด้วยชามปรุงยา และขวดขว้างใส่มอนสเตอร์ได้จริง · **มือถือ:** จอยสติ๊ก ปุ่มโจมตี/คุย/เก็บของ ซูมสองนิ้ว ลากหน้าต่างด้วยนิ้ว
- **ปิดเอฟเฟกต์ภาพทั้งหมด** (เปิดคืนได้ที่ ตั้งค่า) · **ฟาร์มออโต้เลือกมอนสเตอร์ได้** เฉพาะตัวที่อยู่ในแมพนั้น · ช่องเควสหายไปเมื่อทำครบ 5 เควส
- **แมพใหญ่ขึ้นหลายเท่า** ทุ่ง 160×120 ดันเจี้ยน 120×96 (มีห้องบอสใหญ่) เมือง 96×76 และมี **ช่องสี่เหลี่ยมตามเมาส์แบบ Ragnarok** (มุมสี่มุมสีเขียว = เดินได้, สีแดง = เดินไม่ได้) คลิกแล้วเดินไปกลางช่อง
- **NPC เปลี่ยนอาชีพ (Job Master) มีทุกเมือง** รวมทุกการเปลี่ยนอาชีพไว้ที่เดียว: อาชีพแรก (Job Lv 10) อาชีพขั้นสอง (Job Lv 40) เกิดใหม่ (Base 99 / Job 50) อาชีพ High และอาชีพขั้นสูง แสดงเฉพาะอาชีพที่ตัวละครเปลี่ยนไปได้
- **ระบบ GM ควบคุมได้ทุกอย่าง** หน้าต่าง GM 4 แท็บ + คำสั่ง `@` ในแชท (`@help`) และคำสั่ง GM ฝั่งเซิร์ฟเวอร์ด้วยรหัสแอดมิน
- **โลกสไตล์ Ragnarok Online มี 30 แมพใน 9 ภูมิภาค** มีเมือง 7 เมือง ทุ่ง และดันเจี้ยน แต่ละภูมิภาคมีสี สภาพอากาศ เพลง และมอนสเตอร์ของตัวเอง (ดู [docs/WORLD.md](docs/WORLD.md))
- **เควสมีแค่เควสฝึกสอน 5 เควส** ได้แก่ ลงทะเบียนกิลด์ → ล่า Leaf Slime → ซื้อและสวมอาวุธ → ตีบวก +1 → เก็บ Job Lv 10
- **เปลี่ยนอาชีพที่ Guild Master** (Knight อยู่ Aurelion, Ranger อยู่ Fernhollow, Mage อยู่ Arcanthe)
- **ระบบแบบ Ragnarok (กลไกเท่านั้น ไม่ได้ลอกชื่อหรือข้อมูลของ RO):**
  - การ์ดมอนสเตอร์ 70 ใบ ดรอป 0.01% ใส่ลงช่องการ์ดของอุปกรณ์ได้
  - ตารางอาวุธเทียบขนาดมอนสเตอร์
  - โบนัสความเสียหายตามเผ่าและขนาด, Perfect Dodge
  - น้ำหนักเกิน 90% จะตีและใช้สกิลไม่ได้
  - ระบบ MVP พร้อมป้ายหลุมศพ
  - อาวุธมีเลเวล 1–4 และตารางโอกาสตีบวกตามเลเวลอาวุธ
  - ตีอาวุธ (Forging) ใส่หินธาตุและ Star Crumb ได้
  - ออปชันสุ่มบนอุปกรณ์ และ NPC เอนแชนต์
  - เอฟเฟกต์ติดสถานะ/ดูด HP เมื่อโจมตี
  - หน้าต่างฐานข้อมูลมอนสเตอร์ ไอเทม และการ์ดในเกม (กด B)
  - ดูรายละเอียดที่ [docs/RO_SYSTEMS.md](docs/RO_SYSTEMS.md)
- **ระบบตีบวก +1 ถึง +10:** อาวุธตีได้ปลอดภัยถึง +5 และชุดเกราะถึง +4 ถ้าเกินจากนั้นแล้วตีพลาด ของจะแตก
- ระบบที่ทำเสร็จแล้ว ได้แก่ การเดิน (คลิกเมาส์/WASD), กล้องติดตาม, Collision ที่ตรงกับภาพ, NPC/บทสนทนา, Monster AI แบบ State Machine, การต่อสู้แบบ Real-time พร้อมธาตุและ Status, EXP/เลเวล (Base และ Job), Stat Points, Inventory/Equipment, สกิลและ Hotbar, เควสต์ 17 เควสต์, ร้านค้า, คลังเก็บของ, การเซฟ/โหลดแบบมีเวอร์ชัน, เสียง และ UI ครบชุดสำหรับ Phase 1
- **ภาพแผนที่ใหม่ครบ 136 แมพ / 21 ธีม** ใช้ภาพพื้นและวัตถุที่สร้างขึ้นสำหรับเกม มีพื้น 8 รูปแบบต่อวัสดุและขอบผสมอัตโนมัติ ส่วนตัวละคร เอฟเฟกต์ ไอคอน และเสียงยังสร้างด้วยโค้ดขณะรัน
- ระบบออนไลน์ยังไม่ได้ทำ (อยู่ใน Phase 3)

---

## Quick start

Requirements: **Node.js 20+** (tested with Node 22) and npm.

```bash
npm install          # install dependencies
npm run dev          # dev server → http://localhost:5173
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build → http://localhost:4173
npm run build:standalone # self-contained dist-standalone/index.html; double-click to play
```

### Tests
```bash
npm test                 # all unit + integration tests (Vitest)
npm run test:unit        # unit tests only
npm run test:integration # headless playthrough + class balance tests
npm run test:e2e         # builds, then drives the real game in Chromium (Playwright)
npm run test:maps        # all-map chunk seams, coverage and theme screenshots
```
`test:e2e` uses Playwright's Chromium. If it isn't installed: `npx playwright install chromium`.

## Controls
| Action | Mouse | Keyboard (rebindable in Settings) |
|---|---|---|
| Move | Left-click the ground (click the minimap to travel) | WASD / arrow keys |
| Attack | Left-click a monster (keeps auto-attacking) | Tab = target the nearest monster |
| Talk / interact | Left-click an NPC or object | F = nearest NPC/object |
| Pick up loot | Left-click the item | Z = nearest item |
| Skills / items | Click a hotbar slot | 1–0 |
| Stop / cancel | Right-click | Esc closes windows |
| Windows | Bottom-right buttons | I inventory · E equipment · C status · K skills · Q quests · M world map · O settings · F8 GM tools |
| Chat | | Enter (`/help` lists commands) |

Ground-target skills (Arrow Rain, Wind Trap, Fire Wall, Thunderstorm, Meteor) land on your current target. If you have no target, they land under the mouse cursor.

## What's in Phase 1

| Spec item | Status | Where |
|---|---|---|
| Game boot, loading, main menu | ✅ | `src/game/scenes/BootScene.ts`, `src/ui/screens.ts` |
| Character creation (name, body type, hair style/colour, eye colour, skin, 4-direction rotate preview) and 3 slots with create/delete/select | ✅ | `src/ui/screens.ts`, `src/core/character.ts` |
| Movement (click-to-move with A* pathfinding, WASD), camera follow | ✅ | `src/core/world.ts`, `src/core/pathfinding.ts` |
| Map rendering with layers (ground, decoration, walls, objects y-sorted, above-player, collision, spawns, interaction zones, portals) | ✅ | `src/core/mapCompiler.ts`, `src/game/art/mapPainter.ts` |
| Collision that matches the art (no walking through buildings, trees, walls or borders) | ✅ tested | `tests/unit/data.test.ts`, `tests/unit/world.test.ts` |
| NPC interaction and dialogue, quest markers (! ?) | ✅ | `src/ui/windows.ts` |
| Monster AI state machine (Idle → Patrol → Chase → Attack → Return → Death → Respawn); passive, aggressive, assist and magic/ranged types | ✅ | `src/core/world.ts` |
| Combat: auto-attack, range, attack speed, hit/miss/dodge, crits, damage numbers, knockback, death and respawn, aggro, leash | ✅ | `src/core/combat.ts`, `src/core/world.ts` |
| Element system (9 elements, editable 9×9 table) | ✅ | `src/data/elements.json` |
| Status effects (10, each with duration, chance, immunity, stack limit and cure) | ✅ | `src/data/statusEffects.json` |
| EXP and level (Base 1–120, Job 1–10/50), stat points, skill points, stat/skill reset | ✅ | `src/core/formulas.ts`, `src/config/balance.json` |
| Derived stats = Base + Equipment + Passives + Buffs + Statuses (cards and runes plug in later) | ✅ | `computeDerivedStats` |
| Inventory: 60-slot grid, stacking, weight limit, drag & drop, tooltips, sort, filter, lock, use, drop, sell, storage, binding | ✅ | `src/core/inventory.ts`, `src/ui/windows.ts` |
| Equipment: 8 slots, class/level requirements, two-handed rules | ✅ | |
| Jobs: Novice, 6 first jobs, 12 second jobs, rebirth (High Novice + 6 High first jobs) and 12 transcendent jobs (38 classes, 173 skills); job bonus stats, job weight, ASPD 0–190; steal, mug, double attack, endow, discount/overcharge, Luma-cost skills | ✅ | `src/data/classes.json`, `tools/world-gen/build-jobs.ts` |
| Job change at Job Lv 10 at a guild master (Knight & Cleric: Aurelion, Ranger: Fernhollow, Mage: Arcanthe, Rogue: Sandara, Merchant: Tidewatch) | ✅ | NPC service `jobChange`, `World.changeJobAt` |
| Tutorial quests only (5): register, hunt, buy & equip a weapon, refine +1, reach Job Lv 10; objective types include buy/equip/refine; journal, tracker, markers | ✅ | `src/data/quests.json`, `src/core/quests.ts` |
| Refinement +1…+20 (classic rates to +10, renewal over-upgrade to +20), enriched ores, forging, random options + enchanter | ✅ | `src/core/refine.ts`, `forge.ts`, `options.ts` |
| Ragnarok-style mechanics: monster cards (0.01%, slots, compounding, combos, autocast cards, card album), 10 elements × 4 element levels, elemental converters, weapon-vs-size table, race/size bonuses, perfect dodge, 90% weight lock, MVP (top damage, MVP EXP and items, tombstone), elite mini-bosses, looter monsters, pets (taming, hunger, intimacy, Loyal bonus), memorial dungeons; RO stat-cost curve available but off (measured) | ✅ | `docs/RO_SYSTEMS.md` |
| 30 world maps in 9 RO-style regions (7 towns, fields, 8 dungeons, 6 bosses), 104 memorial-dungeon floors (100-floor Endless Spire, Sealed Crypt), PvP arena and guild-war castle; timed raids | ✅ |
| **Auto Farm / Auto Quest** (U or the Auto button): fights around its start point with hotbar skills, potions and looting; or follows the quest chain by itself (walks to NPCs, accepts, hunts, buys and equips, refines safely, levels, hands in). Stops on any manual click/move, death or 90% weight | ✅ | `src/core/autopilot.ts` | `docs/WORLD.md`, `tools/world-gen/build-world.ts` |
| Companions: pets (accessories, evolution), homunculus (4 types), war-drake mount, merchant pushcart; Rune Constellation talent board | ✅ | `src/core/pets.ts`, `homunculus.ts`, `runes.ts` |
| Online play (optional): server with accounts, chat, party with even EXP share, guild, trade, vending, PvP, guild war | ✅ (local server) | `server/`, `src/ui/online.ts` |
| Maps: **Willowbrook Village, Sunny Meadow, Whispering Forest** | ✅ | `src/data/maps/` |
| Monsters: 64 normal, 12 elite mini-bosses, 6 bosses | ✅ | `src/data/monsters.json` |
| Boss: Grukk the Thornking. Intro, HP bar, 3 phases, enrage, telegraphed AoE (circle, ring, charge line), summons, threat, rare drops, contribution reward, respawn timer | ✅ | `src/data/bosses.json` |
| Save/Load: versioned with migrations, backup, sanitizing, autosave every 30s | ✅ tested | `src/core/save.ts` |
| HUD: HP/MP, EXP/Job EXP, hotbar with cooldowns, chat log, minimap, quest tracker, buffs, target frame, boss bar, cast bar, Luma | ✅ | `src/ui/hud.ts` |
| Windows: status, inventory, equipment, skill tree, quest journal, world map, pet (P), homunculus (H), pushcart (V), runes (N), social / online (G), database with refine simulator / forge calculator / option odds / combos / pets / element chart (B), settings (volume, toggles, key rebinding) | ✅ | `src/ui/windows.ts` |
| Audio: BGM per map, boss music, ambience, SFX; Master/Music/SFX/Ambient volume | ✅ (procedural) | `src/game/audio/audio.ts` |

## Online play (optional)

```
npm run server        # ws://localhost:7171 (accounts & guilds saved in ./server-data)
npm run dev           # then in the game: Social window (G) → server ws://localhost:7171 → Create account
```
Chat: plain text = map, `/p` party, `/g` guild, `/gl` global, `/w name` whisper. The Arena Master in Aurelion warps to the Proving Grounds (PvP) and Castle Veyl (guild war, daily 20:00–21:00 server time; `npm run server -- --woe-always` keeps it open).

## Screen layout, zoom, hotbar and Auto

- **Status (top left):** name, class, Base / Job level, HP, MP, Base and Job EXP bars, Luma, and a stat/skill points badge that opens the right window.
- **Minimap (top right)** with a zoom slider, − / + buttons and the zoom %. The mouse wheel and the `=` / `-` keys zoom too (75–250%, saved).
- **Quest tracker** under the minimap, with the **▶ Auto Quest** button.
- **Hotbar:** two rows of 10 — keys 1–0 and Shift+1–0 (rebindable).
- **AUTO** beside the hotbar starts Auto Farm at once (press again to stop); **⚙** opens the auto settings only (radius, potions, skills, loot, elites).
- **Menu (bottom right):** 16 icon buttons in 5 columns (incl. 🏆 Titles and 🎁 Daily); **▼ Menu** folds it away (remembered).
- **Visual effects are off by default:** no skill/hit effect animations, projectiles, particles, weather, screen flashes or bobbing. Characters and monsters still animate, damage numbers stay (both have their own settings). Settings → *Visual effects* turns them back on.
- **Auto Farm targets:** the ⚙ Auto settings list the monster species that live on the current map; tick the ones to farm (none ticked = all). Monsters that attack you are still fought back. Auto settings are saved with the character.
- **Quest panel** hides once every quest is completed.
- **Items:** click an item to get its actions, with a big **Equip** (or **Use**) button first; double-click still equips/uses.

## Market, achievements, daily rewards, brewing and touch

- **Trader Moss** (Willowbrook) is the only Market Trader, and the only place with price graphs. He **buys anything at once** and **sells a stock that changes every 2 hours**: 5 consumables plus 2 pieces of gear from every level tier (1–15, 16–30, … 61–75), picked at random from a pool of 171 items and the same for everyone. Both his buying and selling prices move **every hour**: rarer items swing more, selling a lot of one item lowers what he pays for it, and buying a lot raises what he charges, each for a few hours. His selling price never drops below the most he could ever pay for that item, so buying low and selling back is not possible. The window shows 24-hour graphs for both sides. Other towns have a **Goods Trader** with starter goods at fixed prices.
- **Market Hall** (every town, online only): list up to 10 items with your own price. **Only real players buy**; the server holds the item, pays you on sale (even when you are offline, on your next login) and shows recent sale prices (last and average). Cancel returns the item.
- **Click another player** for a menu: Trade, Invite to party, Invite to guild, Whisper, View shop (when vending).
- **Item compare:** the tooltip of unequipped gear shows what changes against what you wear (ATK, MATK, DEF, MDEF, HIT, FLEE, CRIT, ASPD, Max HP/MP with ▲/▼); two-handed weapons count the shield coming off.
- **Achievements & titles (🏆, 23):** kills, levels, job changes, rebirth, bosses, refine, Luma, quests, pet loyalty, cards, the Spire, play time. Each gives a one-time reward (Luma / items; to storage if the bag is full) and unlocks a title shown under your name (and to other players online).
- **Daily rewards (🎁):** a 7-day calendar by your local date; it opens on the first login of the day; a missed day starts over at Day 1.
- **Timed bonus events** (local clock): EXP +50% from 12:00–13:00 and 20:00–22:00 every day; drop rates +50% all Saturday and Sunday. A banner at the top shows when one is on.
- **Alchemist brewing:** an Alchemist / Grand Alchemist with Potion Research uses a **Medicine Bowl** (opens the brewing window; one is used up per try) to brew Red, Orange, Yellow, Green and Blue Potions, Distilled Spirit, **Fire Bottles** and **Acid Bottles**. The chance grows with Potion Research, Job Level, DEX, LUK and INT; a failure loses the materials. Herbs drop from plant-like monsters; bottles and bowls are sold in Tidewatch. Anyone can **throw** Fire / Acid Bottles at the target or the nearest monster (fire splash + burn, acid + bleed; Potion Research adds 5% per level).
- **Touch controls** (on for touch screens, toggle in Settings): virtual joystick, ⚔ attack / 💬 talk / ✋ loot / 🎯 target buttons, pinch to zoom, windows drag by finger. Tap-to-move and tapping monsters/NPCs work as clicks.

## Big maps and the cell cursor

Maps are several times larger than at first: fields are 160×120 tiles (Willowbrook's meadow and forest 150×110 / 150×120), dungeons 120×96 with 5×4 rooms and a boss hall made of four rooms, towns 96×76 (the old town is the centre, with a ring of houses and woods). Monster counts were raised with the area, so fields stay as crowded as before. Monsters far from the player (over 1,600 px) and idle don't patrol, as in Ragnarok where only monsters near players act; this keeps the simulation fast.

The map art is painted in 16×16-tile chunks around the camera and freed when you walk away, so a big map never needs one huge texture.

**Cell cursor (Ragnarok style):** four green corner brackets mark the cell under the mouse (red where you can't walk); over a monster, NPC or item the mouse pointer changes instead. Clicking the ground walks to the centre of that cell and marks it until you arrive. Settings → *Cell cursor under the mouse* turns it off; *Show grid lines on the map* draws the whole grid.

## Job Master (class change in every town)

Every town, Willowbrook included, has a **Job Master** next to the plaza. It handles every class change in one place, with the normal requirements: first job (Novice, Job Lv 10), second job (Job Lv 40), rebirth (second job, Base 99 / Job 50), the High first jobs and the transcendent jobs. The dialog lists only the jobs open to your current class and path. The class guild masters and the Oracle of Rebirth still work as before.

## Language (English / ไทย)

Pick **English** or **ภาษาไทย** at the top right of the title screen, or under **Settings → Language** in game. The choice is saved with your settings and applies at once, without reloading.

How it works: the game text is written in English, and in Thai mode `src/ui/i18n.ts` translates every piece of text shown in the HTML interface through the dictionaries in `src/i18n/` (about 1,700 entries: menus, windows, tooltips, chat-log and system messages, GM tools, NPC dialogue, the tutorial quests, class and skill descriptions, item descriptions). Text with numbers or names (for example `Bought 3× Red Potion for 150 Luma.`) is matched by patterns. Floating combat text on the game canvas is translated too.

What stays in English on purpose: proper names (items, monsters, skills, maps, NPCs, classes, runes), stat abbreviations (STR, ATK, HIT…), chat typed by players and the `@`/`/` command words. A unit test checks that every quest line, NPC greeting, class, skill and item description has a Thai version.

## GM / admin tools

Open the GM window with the **GM** button (bottom right), **F8**, or `/gm` in chat. It has four tabs:
- **Main**: heal, god mode, add levels / Luma / points, change class, give items, teleport, spawn monsters, defeat all, fill/reset quests
- **Character+**: set Base/Job level exactly, set one or all stats, max all skills, reset stats/skills, set Luma, rebirth now, make an item to order (refine +0–20, element, card), refine an equipped slot, clear inventory, give a pet, create a homunculus (any type/level), mount + cart, bonus rune points
- **World & rates**: one-hit kill, no cooldown / free skills, invisible to monsters, move speed, game speed ×1–10, EXP/drop/Luma rates, warp to map x/y, respawn the boss now, clear ground items, start/end a raid, jump to any memorial-dungeon floor (Spire 1–100), reset dungeon cooldowns, complete/reset all quests, Auto Farm / Auto Quest
- **@ Console**: RO-style text commands

Text commands also work in the chat box. `@help` lists them all, e.g. `@lvl 99 50`, `@stat all 99`, `@item <id> 1 refine=15 element=fire cards=<cardId>`, `@rates 500 300 200`, `@onehit on`, `@gamespeed 3`, `@warp <mapId> 20 15`, `@dungeon endless_spire 50`, `@raid end`.

Server GM (online): start the server with `npm run server -- --admin-token=YOURSECRET` (or `VEYLORIA_ADMIN_TOKEN`). In game type `@token YOURSECRET`, then `@announce text`, `@players`, `@kick name [reason]`, `@woe open|close|auto`, `@castle <guild>|none`, `@emperium`. Without a token on the server these are refused.

Single-player GM tools edit the local save only, and any use sets `flags.gmUsed` on the character. The commands live in `src/core/gm.ts`. Because characters are stored in each browser (see Limitations), the server cannot edit another player's character, items or levels; server GM covers what the server owns (chat, players, guild war, castle).

## Test results (this commit)

| Suite | Result |
|---|---|
| Unit (`tests/unit`, 28 files) | **1020 / 1020 passed** (most are per-map checks for all 136 maps): market prices (hourly buy and sell prices, rarity, player demand, no buy-low/sell-high loop, Trader Moss stock re-rolled every 2 hours across every gear tier), achievements / titles / daily calendar / bonus hours, Alchemist brewing and thrown bottles, second jobs and rebirth, over-upgrade, homunculus, mount, cart, pet evolution, runes, raids, 100-floor Spire, element levels, enriched refine and fees, jobs (bonus stats, weight, ASPD, steal, haggle, coin cost, cure), pets, combos, card album, autocast, elites, looters, memorial dungeons, database calculators, plus forge, random options, refine, cards, quests, GM, data validation and per-map reachability (44 maps), formulas, combat, inventory, save/migrations, world simulation |
| Integration: full playthrough | **passed**. A bot using only player commands finishes the 5 tutorial quests, becomes a Knight at the guild in Aurelion, switches to a spear for the Large boss (RO size rule), refines, and defeats Grukk (≈94 simulated minutes, Base Lv 24, 1 attempt). A second test walks through portals to all 30 world maps |
| Integration: Auto Quest / Auto Farm | **passed**. Auto Quest takes a new character through all 5 tutorial quests by itself (≈11 simulated minutes, no deaths); Auto Farm got 147 kills in 10 simulated minutes and stayed within its radius; it stops when overweight |
| Integration: class balance | **passed**. All six first jobs beat Grukk at Lv 17 on the first try at least as often as their thresholds over 24 fixed seeds (Knight ≥22, Ranger ≥12, Mage ≥17, Cleric ≥9, Rogue ≥8, Merchant ≥20); re-checked on the widened Whispering Forest. Second jobs vs Archmage Valdris in its new boss hall (12 seeds): 7–12 wins each (table in `docs/RO_SYSTEMS.md`) |
| Integration: server | **8 / 8 passed**: accounts, presence and chat, party EXP share, trade, vending, guilds / PvP / guild war, server GM with admin token, Market Hall (list, own-buy refused, buy, seller paid, offline payout on rejoin, cancel), with real WebSocket clients |
| Online E2E, two browsers (`npm run test:online`) | **8 / 8 checks passed** three runs in a row: presence, map chat, party EXP share, trade, vending, PvP, guild war, no page errors |
| E2E in Chromium (`npm run test:e2e`) | **39 / 39 checks passed** (incl. the daily calendar at login, Trader Moss graph and instant sale, Market Hall offline notice, item compare tooltip, achievements and a title under the name, brewing with a Medicine Bowl, the quest panel hiding when all quests are done, zoom, the 20-slot hotbar, click-to-Equip, the AUTO button and Auto Quest from the tracker, the cell cursor, cell-centred click walking and chunked map drawing, switching to Thai and back on the title screen and in game, pet window, database tools, entering the Endless Spire, GM window, refine and guild job change): boot, create character via UI, WASD, click NPC → dialogue → accept quest, windows by hotkey, portal travel, mouse-click combat kill with EXP, save and reload persistence, shop purchase, drag & drop equip, stat allocation, job change via dialogue, learn skill, drag skill to hotbar, cast by hotkey, death → respawn, drop part of a stack via the quantity dialog, delete a character with typed-name confirmation, zero page errors |

Screenshots from the e2e run are written to `tests/e2e/screenshots/` (git-ignored).


## Project structure
```
src/
  core/      game rules & simulation (no rendering): world, combat, formulas, inventory, quests, maps, save
  data/      JSON content: classes, skills, items, monsters, bosses, drops, NPCs, shops, quests, maps, tiles, audio
  config/    balance.json (all tunable numbers)
  game/      Phaser scenes, procedural art, effects, audio, texture registry
  ui/        HTML UI: app shell, screens, HUD, windows, CSS
tests/       unit/, integration/, e2e/, helpers/ (bot & scenario builders)
docs/        ARCHITECTURE.md, RO_SYSTEMS.md, WORLD.md
scripts/     run-ts.mjs (runs the TypeScript server and world generator)
tools/world-gen/      generators for maps, NPCs, items and jobs
```
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Not done yet (honest list)
- **All art and audio are generated at runtime.** The hand-made art files (Batch 001 sprite sheets, animations, VFX, tilesets) and the art tools were removed; characters, monsters, maps, icons, music and sounds are all drawn or synthesised by the game.
- **Online play is not server-authoritative.** `npm run server` connects players (accounts, chat, party, guild, trade, vending, PvP, guild war), but each character lives in its own browser's `localStorage` and the server trusts what clients report, so it is not cheat-proof. The published web page can't reach a server on your computer; online play needs the server plus `npm run dev`/`preview` on a reachable machine. PvP and the Emperium use basic attacks only.
- **Not built yet:** third jobs; skills against other players; server-side characters and anti-cheat.
- All 30 maps exist. Their 64 regular monsters and 6 bosses reuse 14 procedural body types in regional colours, and the stats of the newer monsters come from a level formula. Equipment still tops out around level 20, so the Lv 40–85 regions need new gear tiers and haven't been balance-tested.
- The world map shows the other regions as "Unexplored". They're labels, not playable areas.

## Known issues
- Balance has been tuned with bots (`tests/integration`), not human playtesters. A careless Novice can still die often around Lv 9–11 near wasps and goblins.
- Monsters don't collide with each other, so they can overlap (classic RO-style).
- Name labels can overlap when a player stands right next to an NPC or monster.
- The production JS bundle is about 1.5 MB (mostly Phaser), so Vite prints a chunk-size note.
- Performance has only been checked with the Phase 1 entity counts (about 40 monsters per map). It hasn't been load-tested.
- The layout targets desktop 1280×720 and scales to fit the window. Touch controls were checked in a phone-sized emulated browser (joystick, pinch zoom), not on real phones; on small screens the UI is small, and the hotbar, menu and windows are still mouse-sized.
- Trader Moss's prices are calculated in each game client (his stock is the same for everyone, from the clock): "player demand" is what *you* sold recently, not what every player sold, because characters are not stored on the server. Market Hall prices and sales are real and shared, but the server trusts the client about the item it lists (same trust model as trading).

## Next phase
Second jobs and their skill trees, gear tiers for the Lv 40–85 regions with bot balance passes, and better procedural art for monsters and classes. All of it plugs into the existing data files and `World` APIs. Phase 3 then moves `World` onto a Node.js (Colyseus) server with PostgreSQL/Redis for authoritative online play.

## Credits & licensing
All code, data, procedural art and synthesized audio in this repository are original. The game is inspired by classic MMORPGs, but it doesn't use any characters, art, maps or sounds from other games.

## Downloaded game: opening without a server

The downloadable ZIP uses a self-contained `index.html` with inline classic JavaScript,
CSS and data-URL artwork. Extract the ZIP and double-click `index.html`. Do not mix
it with the previous `assets/` folder. The normal `npm run build` output still targets
HTTP hosting; generate direct-open downloads with `npm run build:standalone`.

Run `npm run test:standalone` with Playwright to check a direct `file://` launch.
In managed browsers where administrator policy blocks all `file://` navigation,
`STANDALONE_TEST_MODE=http` validates embedded assets, all 21 themes, movement and
save/reload over a local document URL, with asset networking disabled. This mode
does not establish a successful direct file launch.
