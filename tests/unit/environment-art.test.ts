import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/core/data';
import { compileMap } from '../../src/core/mapCompiler';
import { ENVIRONMENT_THEMES, GROUND_MATERIALS, layerAt, terrainSource } from '../../src/game/art/environmentManifest';

describe('environment artwork coverage and neighbour bounds', () => {
  const data = loadGameData();
  it('covers every map, all materials and all instance floors with a valid atlas cell', () => {
    for (const def of data.maps.values()) {
      expect(ENVIRONMENT_THEMES[def.tileset], def.id).toBeDefined();
      const map = compileMap(data, def);
      for (const material of new Set(map.ground)) {
        expect(GROUND_MATERIALS as readonly string[]).toContain(material);
        const source = terrainSource(def.tileset, material);
        expect(source, `${def.id}:${material}`).toBeGreaterThanOrEqual(0);
        expect(source).toBeLessThan(21);
      }
    }
  });
  it('does not connect opposite map edges through array row wrapping', () => {
    const grid = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(layerAt(grid, 3, 2, -1, 1)).toBeNull();
    expect(layerAt(grid, 3, 2, 3, 0)).toBeNull();
    expect(layerAt(grid, 3, 2, 0, -1)).toBeNull();
    expect(layerAt(grid, 3, 2, 0, 2)).toBeNull();
    expect(layerAt(grid, 3, 2, 2, 1)).toBe('f');
  });
});
