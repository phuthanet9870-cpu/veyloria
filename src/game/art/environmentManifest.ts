/** All map palettes resolve through this manifest, including all instance floors. */
export const ENVIRONMENT_THEMES: Record<string, { terrain: number; prop: number }> = {
  willowbrook: { terrain: 0, prop: 0 }, sunny_meadow: { terrain: 1, prop: 1 },
  whispering_forest: { terrain: 2, prop: 2 }, clover: { terrain: 1, prop: 1 },
  capital: { terrain: 0, prop: 3 }, fernwood: { terrain: 2, prop: 2 },
  arcane: { terrain: 4, prop: 4 }, desert: { terrain: 5, prop: 5 },
  coast: { terrain: 0, prop: 6 }, snow: { terrain: 7, prop: 7 },
  volcano: { terrain: 8, prop: 8 }, swamp: { terrain: 9, prop: 9 },
  ruins: { terrain: 10, prop: 10 }, dg_catacomb: { terrain: 11, prop: 11 },
  dg_cave: { terrain: 12, prop: 12 }, dg_tower: { terrain: 13, prop: 13 },
  dg_tomb: { terrain: 14, prop: 14 }, dg_grotto: { terrain: 15, prop: 15 },
  dg_ice: { terrain: 16, prop: 16 }, dg_magma: { terrain: 17, prop: 17 },
  dg_crypt: { terrain: 18, prop: 18 },
};

export const GROUND_MATERIALS = ['grass', 'grass_dark', 'forest_floor', 'dirt', 'soil', 'path_stone', 'ruin_floor', 'sand', 'water', 'thorn_ground'] as const;

/** Lower priority materials feather into higher ones, never changing collision. */
export const MATERIAL_PRIORITY: Record<string, number> = {
  grass: 0, grass_dark: 1, forest_floor: 2, thorn_ground: 3, sand: 4,
  soil: 5, dirt: 6, path_stone: 7, ruin_floor: 8, water: 9,
};

/** Safe grid lookup: a horizontal neighbour must never wrap to the next row. */
export function layerAt(layer: readonly (string | null)[], width: number, height: number, x: number, y: number): string | null {
  return x >= 0 && y >= 0 && x < width && y < height ? layer[y * width + x] ?? null : null;
}

export function terrainSource(theme: string, material: string): number {
  const base = ENVIRONMENT_THEMES[theme]?.terrain ?? 0;
  if (material === 'water') return theme === 'volcano' || theme === 'dg_magma' ? 17 : theme === 'snow' || theme === 'dg_ice' ? 16 : theme === 'swamp' ? 9 : 6;
  if (material === 'sand') return 5;
  if (material === 'path_stone') return theme === 'arcane' ? 4 : theme.startsWith('dg_') ? base : 3;
  if (material === 'ruin_floor') return theme.startsWith('dg_') || theme === 'ruins' ? base : 10;
  if (material === 'dirt' || material === 'soil') return theme === 'snow' ? 7 : theme === 'volcano' ? 8 : theme === 'desert' ? 5 : theme.startsWith('dg_') ? base : 19;
  return base;
}
