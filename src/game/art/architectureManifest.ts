/** Architecture has one authored camera: south-facing facade, 45° elevation.
 * Never rotate or mirror these sprites, including variations and city gates. */
export const ARCHITECTURE_CAMERA = Object.freeze({ facing: 'south', elevationDegrees: 45, rotation: 0, flipX: false, flipY: false });
export const ARCHITECTURE_THEMES = ['willowbrook', 'capital', 'fernwood', 'arcane', 'desert', 'coast', 'snow'] as const;
export const ARCHITECTURE_STYLES = ['house', 'inn', 'shop', 'smithy', 'guild'] as const;
export const ARCHITECTURE_ALIASES:Record<string,{theme:string;style:string}>={
  aurelion_residence:{theme:'willowbrook',style:'house'},
  knight_guild:{theme:'capital',style:'guild'},ranger_guild:{theme:'fernwood',style:'guild'},
  mage_guild:{theme:'arcane',style:'guild'},merchant_guild:{theme:'willowbrook',style:'guild'},
};
export const EXTRA_ARCHITECTURE_STYLES=['aurelion_palace','aurelion_cathedral','aurelion_stall_red','aurelion_stall_gold','aurelion_stall_blue','aurelion_farmhouse',...Object.keys(ARCHITECTURE_ALIASES)];
export type ArchitecturePart = 'castle' | 'gate' | 'wall';
export function architectureTheme(theme: string): number {
  if (theme === 'snow' || theme === 'dg_ice') return 6;
  if (theme === 'coast' || theme === 'dg_grotto') return 5;
  if (theme === 'desert' || theme === 'volcano' || theme === 'dg_magma') return 4;
  if (theme === 'arcane' || theme === 'dg_tower') return 3;
  if (['fernwood', 'whispering_forest', 'swamp', 'dg_cave'].includes(theme)) return 2;
  if (['capital', 'dg_tomb', 'dg_catacomb', 'ruins', 'dg_crypt'].includes(theme)) return 1;
  return 0;
}

/** Source frames use the transparent gutters of the reviewed masters. */
export const BUILDING_COLUMNS = [0, 202, 416, 616, 827, 1060];
export const BUILDING_ROWS_BY_COLUMN = [
  [0, 212, 424, 636, 857, 1060, 1272, 1484],
  [0, 212, 424, 636, 860, 1060, 1272, 1484],
  [0, 212, 424, 636, 859, 1060, 1272, 1484],
  [0, 212, 424, 638, 863, 1060, 1274, 1484],
  [0, 212, 424, 639, 860, 1064, 1275, 1484],
];
export const CASTLE_COLUMNS = [0, 310, 580, 831, 1102, 1370, 1640, 1916];
export const CASTLE_ROWS = [0, 330, 600, 821];
