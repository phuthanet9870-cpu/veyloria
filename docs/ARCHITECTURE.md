# Veyloria Online: Architecture

## Layers

```
src/data/*.json, src/config/balance.json     Static game data + balance numbers (no code)
        │
src/core/   (pure TypeScript, no Phaser, no DOM)
  data.ts          loads & cross-validates all data files
  formulas.ts      EXP curves, derived stats (Base + Equipment + Passives + Buffs + Statuses)
  combat.ts        hit/miss, critical, defense, element table, status rolls
  inventory.ts     stacking, weight, slots, equip rules, shop, storage (atomic ops)
  character.ts     creation, stat allocation, skills, job change
  quests.ts        data-driven quest manager (talk/kill/collect/deliver/explore/boss/interact/craft)
  mapCompiler.ts   MapDef → tile layers + objects + collision + reachability
  pathfinding.ts   A* + line-of-sight smoothing
  world.ts         the simulation: player, monster AI state machine, bosses, skills, loot, portals
  save.ts          versioned save format + migrations + sanitizing
        │  World.update(dt), World commands, WorldEvent stream
src/game/   (Phaser 3 + WebGL)
  scenes/GameScene renders the World, turns mouse input into World commands
  art/*            generated environment atlas sampling + procedural character/FX art
  audio/audio.ts   WebAudio synth: BGM sequencer, ambience, SFX
  assets.ts        texture registry; normalized image props and chunked terrain
  ../assets/environment/  generated terrain and prop source atlases
src/ui/     (HTML/CSS overlay)
  app.ts           screen flow, save management, keybinds, GameHost bridge
  screens.ts       title / character select / character creation
  hud.ts           HUD widgets
  windows.ts       inventory, equipment, status, skills, quests, map, settings, dialogue, shop, storage
```

### Why the simulation lives in `src/core`
All game rules (movement, collision, combat, drops, quests, economy) run in `World`, which has
no rendering or browser dependencies:

- **Testable:** `tests/integration/playthrough.test.ts` plays all of Phase 1 headlessly, as a
  bot that only issues player commands.
- **Ready for authoritative online play (Phase 3):** the server will run this same `World`.
  The client will send *intents* (`moveTo`, `attack`, `castSkill`, `useItem`, `buy`…), and the
  server will resolve the results with its own seeded `Rng`. Phase 1 already validates intents
  on the simulation side (NPC proximity for shops and storage, item cooldowns, MP and cooldown
  checks, atomic inventory operations), so the server can reuse that code instead of rewriting it.

### Event flow
`World` produces `WorldEvent`s: damage, fx, sound, level-up, boss phases, NPC interactions and
quest updates. Each frame, `GameScene` drains them, draws effects, plays sounds, and passes them
to the `App`, which updates the HUD and windows. Rendering never changes game state.

## Data-driven content
| Content | File | Notes |
|---|---|---|
| Classes | `src/data/classes.json` | job tiers, HP/MP growth, weapon types, skill list, job-change requirements |
| Skills | `src/data/skills.json` | effects: damage, heal, status, buff, knockback, taunt, ground zone, line |
| Items | `src/data/items.json` | consumables, materials, quest items, equipment with stat modifiers |
| Monsters | `src/data/monsters.json` | stats, element, AI type, drops, art spec |
| Bosses | `src/data/bosses.json` | 3 phases, enrage, telegraphed skills, summons, contribution rewards |
| Drops | `src/data/drops.json` | per-monster drop tables |
| Quests | `src/data/quests.json` | objectives, prerequisites, rewards, dialogue |
| NPCs / Shops | `src/data/npcs.json`, `shops.json` | services: shop, storage, inn, save point, resets |
| Maps | `src/data/maps/*.json` | paint ops, portals, spawns, NPCs, objects, areas |
| Elements / Statuses | `elements.json`, `statusEffects.json` | 9×9 modifier table; 10 status effects |
| Balance | `src/config/balance.json` | every formula coefficient |

`validateGameData()` checks every cross-reference (for example, a quest pointing at an NPC that
isn't placed on any map). `tests/unit/data.test.ts` runs it, along with map reachability checks
that confirm every portal, NPC, interactive object and spawn area can be reached on foot.

## Monster AI
State machine: `idle → patrol → chase → attack → return → dead → (respawn)`.
- `passive`: fights back only when attacked. `aggressive`: aggroes within range. `assist`: up to
  2 nearby monsters of the same kind join when one is attacked. `magic`/`ranged`: fire projectiles from range.
- Leash: a monster that strays more than `leashRange` from home returns there and fully heals.
- Bosses add phase changes at 66% and 33% HP, enrage (by timer or at low HP), telegraphed area
  attacks (circle, ring and line shapes that you can dodge), and summoned minions.

## Saves
`SaveFile { version, account, characters[3], settings }`, stored in `localStorage` (Phase 1).
`migrateSave()` upgrades older versions one step at a time (v0 → v1 → v2).
`sanitizeCharacter()` drops references to content that no longer exists, and the previous save
is kept as `veyloria.save.backup`.
