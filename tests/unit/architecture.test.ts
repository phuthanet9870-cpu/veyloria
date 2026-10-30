import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/core/data';
import { compileMap } from '../../src/core/mapCompiler';
import { EMPERIUM_POS } from '../../src/net/protocol';
import { ARCHITECTURE_CAMERA, ARCHITECTURE_STYLES, ARCHITECTURE_THEMES, architectureTheme } from '../../src/game/art/architectureManifest';

describe('front-facing architecture', () => {
  const data = loadGameData();
  it('uses one fixed south-facing 45-degree camera without rotation or mirroring', () => {
    expect(ARCHITECTURE_CAMERA).toEqual({ facing: 'south', elevationDegrees: 45, rotation: 0, flipX: false, flipY: false });
  });
  it('covers every placed building and all seven town themes', () => {
    const themes = new Set<number>(); let buildings = 0;
    for (const def of data.maps.values()) {
      const map = compileMap(data, def);
      for (const b of map.buildings) {
        expect([...ARCHITECTURE_STYLES, 'castle']).toContain(b.style);
        expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(map.width); expect(b.y + b.h).toBeLessThanOrEqual(map.height);
        themes.add(architectureTheme(def.tileset)); buildings++;
      }
    }
    expect(themes.size).toBe(ARCHITECTURE_THEMES.length);
    expect(buildings).toBeGreaterThan(100);
  });
  it('keeps the castle entrance, siege corridor and Emperium reachable', () => {
    const map = compileMap(data, data.maps.get('castle_veyl')!);
    expect(map.buildings.some(b => b.style === 'castle')).toBe(true);
    for (let x = 18; x < 22; x++) expect(map.reachable[14 * map.width + x]).toBe(1);
    const x = Math.floor(EMPERIUM_POS.x / 32), y = Math.floor(EMPERIUM_POS.y / 32);
    expect(map.reachable[y * map.width + x]).toBe(1);
    expect(map.reachable[7 * map.width + 20]).toBe(1);
  });
});
