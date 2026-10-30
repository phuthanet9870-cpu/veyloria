import type { MapDef, PaintOp, Rect } from '../core/types';

/** Hand-authored concept plan, expanded to 120×80 tiles at the concept's 3:2 ratio.
 * Coordinates below use a 96×64 drafting grid; tile rect endpoints are rounded
 * together so canals, city walls and bridges cannot develop one-cell cracks. */
export const AURELION_SCALE = 1.25;
const p = (n: number) => Math.round(n * AURELION_SCALE);
const rect = (r: Rect): Rect => ({ x: p(r.x), y: p(r.y), w: p(r.x + r.w) - p(r.x), h: p(r.y + r.h) - p(r.y) });

export function buildAurelionConcept(original: MapDef): MapDef {
  const ops: PaintOp[] = [];
  const R = (tile: string, x: number, y: number, w: number, h: number, layer: 'ground' | 'wall' | 'deco' = 'ground') => ops.push({ op: 'rect', tile, x, y, w, h, layer });
  const road = (points: [number, number][], width = 3, tile = 'path_stone') => ops.push({ op: 'path', points, width, tile });
  const building = (style: string, x: number, y: number, w: number, h: number, sign?: string) => ops.push({ op: 'building', style, x, y, w, h, door: Math.floor(w / 2), ...(sign ? { sign } : {}) });
  const object = (kind: string, x: number, y: number, id?: string) => ops.push({ op: 'object', kind, x, y, ...(id ? { id } : {}) });

  // Sea and connected canals first, then reclaimed islands and walkable bridges.
  R('water', 0, 40, 28, 24); R('water', 77, 47, 19, 17);
  R('water', 33, 11, 3, 17); R('water', 63, 11, 3, 17); R('water', 33, 25, 33, 3);
  R('water', 38, 28, 3, 18); R('water', 58, 28, 3, 18); R('water', 38, 44, 23, 3);
  R('water', 20, 39, 19, 3); R('water', 61, 35, 17, 3);
  R('water', 75, 39, 3, 22); R('water', 56, 57, 23, 4);
  R('grass', 26, 42, 18, 16); R('grass', 55, 48, 21, 9); R('grass', 81, 49, 14, 13);
  R('grass', 64, 38, 11, 11); R('grass', 78, 38, 11, 10);

  // Enclosing stone walls; roads below open the four intended city gates.
  R('ruin_wall', 5, 5, 82, 1, 'wall'); R('ruin_wall', 5, 5, 1, 35, 'wall');
  R('ruin_wall', 89, 6, 1, 44, 'wall'); R('ruin_wall', 26, 57, 55, 1, 'wall');
  R('ruin_wall', 26, 42, 1, 16, 'wall'); R('ruin_wall', 80, 49, 1, 9, 'wall');
  R('ruin_wall', 24, 5, 2, 3, 'wall'); R('ruin_wall', 30, 5, 2, 3, 'wall');

  // Castle island, grand square and its principal north/south and east/west axes.
  R('path_stone', 36, 22, 27, 3); R('path_stone', 41, 29, 17, 15);
  R('path_stone', 21, 28, 16, 14); R('path_stone', 7, 34, 12, 6);
  R('path_stone', 61, 33, 29, 3); R('path_stone', 75, 47, 15, 4);
  R('path_stone', 29, 52, 13, 3); R('path_stone', 23, 41, 7, 3);
  R('path_stone',20,38,9,7);
  R('path_stone', 1, 40, 4, 8); R('dirt',82,53,12,9);
  road([[46, 22], [46, 63]], 5); road([[0, 30], [95, 30]], 4);
  road([[26, 0], [26, 27], [40, 27], [40, 30]], 4);
  road([[6, 26], [37, 26]], 3); road([[7, 24], [7, 39]], 3);
  road([[19, 8], [19, 27]], 2); road([[9, 21], [31, 21]], 2);
  road([[31, 8], [31, 27]], 2); road([[12, 8], [31, 8]], 2);
  road([[65, 22], [87, 22], [87, 31]], 3);
  road([[65, 33], [89, 33]], 3); road([[71, 23], [71, 49]], 2);
  road([[62, 45], [88, 45]], 3); road([[61, 38], [61, 55]], 2);
  road([[27, 43], [27, 55], [47, 55]], 3); road([[27, 51], [48, 51]], 3);
  road([[60, 50], [91, 50]], 3); road([[60, 55], [75, 55]], 3);
  road([[86, 51], [86, 61]], 2, 'dirt'); road([[81, 58], [94, 58]], 2, 'dirt');
  road([[90, 30], [93, 30], [93, 10]], 2, 'dirt');
  // Foot bridges / quays are genuine walkable ground, not painted over water.
  R('wood_plank', 13, 42, 3, 19); R('wood_plank', 4, 48, 23, 2);
  R('wood_plank', 5, 43, 3, 16); R('wood_plank', 4, 55, 20, 2);
  road([[23, 43], [27, 43]], 3); R('wood_plank', 17, 42, 10, 2);

  // Palace and the distinct districts seen in the supplied concept.
  building('aurelion_palace', 36, 10, 25, 12, 'Royal Palace');
  for (const y of [12,18,24]) for (const x of [9,15,22]) building('aurelion_residence',x,y,4,3);
  building('guild', 8, 31, 10, 6, "Adventurers' Guild");
  building('knight_guild', 62, 28, 8, 5, 'Knight Guild');
  building('ranger_guild', 72, 28, 7, 5, 'Ranger Guild');
  building('mage_guild', 81, 28, 7, 5, 'Mage Guild');
  building('merchant_guild', 62, 40, 9, 5, 'Merchant Guild');
  building('aurelion_cathedral', 77, 40, 10, 7, 'Royal Cathedral');
  building('inn', 30, 46, 10, 6, 'Royal Inn');
  building('smithy', 20, 39, 6, 4, 'Capital Smithy');
  building('aurelion_farmhouse', 83, 11, 5, 4, 'Royal Farm');
  for (const [x,y,style] of [[22,29,'aurelion_stall_red'],[29,29,'aurelion_stall_gold'],[22,34,'aurelion_stall_blue'],[29,34,'aurelion_stall_red']] as const) building(style,x,y,4,3);
  for (const [x,y] of [[29,54],[36,54],[57,51],[64,51],[70,51]] as const) building('aurelion_residence',x,y,4,3);
  // Cultivated plots with open aisles and a functional stable NPC courtyard.
  for (const x of [67,73,79]) { R('soil',x,11,4,8); R('crops',x,11,4,8,'deco'); }
  object('capital_windmill',85,18); object('haystack',83,17); object('haystack',87,17);
  object('capital_statue',47,31); object('capital_fountain',47,37,'aurelion_fountain');
  object('capital_ship',8,43); object('capital_galleon',18,50); object('capital_rowboat',3,58);
  object('capital_lighthouse',2,45); object('capital_cave',91,7);
  for (const [x,y] of [[83,54],[88,54],[92,54],[83,60],[90,60]] as const) object('capital_training_dummy',x,y);
  for (const [x,y] of [[42,30],[56,30],[42,42],[56,42],[45,24],[52,24],[19,28],[36,35],[73,39],[88,47],[31,44],[41,54]] as const) object('lamp_post',x,y);
  for (const [x,y] of [[42,33],[55,33],[42,40],[55,40],[40,23],[57,23],[73,42],[88,42],[28,46],[40,46]] as const) object('planter',x,y);
  for (const [x,y] of [[8,8],[14,8],[32,7],[7,18],[31,18],[32,23],[35,9],[62,9],[67,7],[84,7],[88,22],[79,48],[54,53],[73,56],[42,53]] as const) object('tree_oak',x,y);
  for (const [x,y] of [[17,43],[24,48],[12,49],[6,51],[20,43],[31,40]] as const) object('crate',x,y);
  for (const [x,y] of [[21,43],[23,49],[14,51],[24,38],[34,34]] as const) object('barrel',x,y);
  ops.push({ op:'scatter',kind:'deco:flowers',density:0.05,seed:23061030 });
  ops.push({ op:'scatter',kind:'deco:tuft',density:0.02,seed:23061031 });
  ops.push({op:'scatter',kind:'tree_oak',area:{x:2,y:2,w:92,h:2},density:0.2,seed:23061032});
  ops.push({op:'scatter',kind:'tree_oak',area:{x:2,y:8,w:2,h:30},density:0.18,seed:23061033});
  ops.push({op:'scatter',kind:'tree_oak',area:{x:91,y:2,w:3,h:27},density:0.18,seed:23061034});

  const paint: PaintOp[] = ops.map(op => {
    if (op.op === 'rect' || op.op === 'clear') return { ...op, ...rect(op) };
    if (op.op === 'path') return { ...op, points: op.points.map(([x,y]) => [p(x),p(y)] as [number,number]), width: p(op.width) };
    if (op.op === 'building') return { ...op, ...rect(op), door: p(op.x + (op.door ?? Math.floor(op.w/2))) - p(op.x) };
    if (op.op === 'object') return { ...op, x:p(op.x),y:p(op.y) };
    if(op.op==='scatter'&&op.area)return {...op,area:rect(op.area)};
    return op;
  });
  const positions: Record<string,[number,number]> = {
    aurelion_innkeeper:[35,53], aurelion_smith:[26,43], aurelion_merchant:[26,33],
    aurelion_courier:[43,40], guild_knight:[65,35], guild_dragoon:[68,35],guild_templar:[62,35],
    guild_cleric:[79,49],guild_bishop:[82,49],guild_ascetic:[85,49],oracle_rebirth:[76,49],
    aurelion_jobmaster:[11,37],aurelion_arena:[14,37],spire_warden:[17,37],
    aurelion_stable:[85,22],aurelion_trader:[30,38],aurelion_market:[33,38],
  };
  const areas: [string,string,Rect][] = [
    ['palace','Royal Palace',{x:35,y:9,w:28,h:16}], ['plaza','Royal Square',{x:41,y:29,w:17,h:15}],
    ['residential','Residential Quarter',{x:8,y:9,w:24,h:16}],['market','Central Market',{x:21,y:28,w:15,h:13}],
    ['adventurers','Adventurers Guild',{x:7,y:28,w:12,h:11}],['guilds','Guild Quarter',{x:62,y:27,w:27,h:10}],
    ['cathedral','Royal Cathedral',{x:76,y:39,w:13,h:10}],['harbor','Royal Harbor',{x:2,y:42,w:24,h:19}],
    ['farm','Royal Farm',{x:66,y:9,w:23,h:14}],['inn','Inn Quarter',{x:28,y:44,w:14,h:13}],
    ['trade','Trade Quarter',{x:55,y:49,w:20,h:8}],['training','Training Ground',{x:81,y:52,w:14,h:10}],
  ];
  const scenery: NonNullable<MapDef['scenery']> = [];
  const labels:Record<string,[number,number]>={palace:[48.5,17],plaza:[49,36],residential:[19,11],market:[28,28],adventurers:[13,28],guilds:[75,27],cathedral:[82,39],harbor:[15,47],farm:[76,10],inn:[35,45],trade:[65,50],training:[87,53]};
  const decor = (kind:string,x:number,y:number,w:number,h:number,depth?:number,opening?:number) => scenery.push({kind,x:x*AURELION_SCALE,y:y*AURELION_SCALE,w:w*AURELION_SCALE,h:h*AURELION_SCALE,...(depth==null?{}:{depth}),...(opening==null?{}:{opening:opening*AURELION_SCALE})});
  for (let x=6;x<86;x+=4) if (x<23||x>30) decor('city_wall',x,6,4,2.5);
  for (let x=26;x<80;x+=4) if(x<43||x>51) decor('city_wall',x,58,4,2.5);
  decor('city_gate',24,8,8,6,undefined,4); decor('city_gate',44,59,9,7,undefined,5);
  decor('city_gate',1,34,8,7,undefined,4); decor('city_gate',86,34,8,7,undefined,4);
  for(const [x,y,w,h] of [[36,34,7,4],[56,34,7,4],[73,48,7,4]] as const) decor('bridge_ew',x,y,w,h,-8);
  for(const [x,y,w,h] of [[45,29,7,6],[45,49,7,6]] as const) decor('bridge_ns',x,y,w,h,-8);
  const portals = original.portals.map(portal => {
    const r = portal.targetMap==='aurelion_fields_north'?{x:26,y:0,w:4,h:2}:portal.targetMap==='aurelion_fields_south'?{x:46,y:62,w:5,h:2}:portal.targetMap==='arcanthe_heath'?{x:94,y:30,w:2,h:4}:{x:0,y:30,w:2,h:4};
    return {...portal,...rect(r)};
  });
  const spawn = (x:number,y:number)=>({x:p(x),y:p(y)});
  return {...original,width:120,height:80,paint,portals,scenery,
    spawnPoints:{default:spawn(48,41),from_aurelion_fields_south:spawn(48,60),from_aurelion_fields_north:spawn(28,4),from_arcanthe_heath:spawn(91,32),from_aurelion_catacombs:spawn(4,32)},
    npcs:original.npcs.map((n,i)=>{const [x,y]=positions[n.npcId]??[43+i%3,42+Math.floor(i/3)];return {...n,x:p(x),y:p(y),facing:'down'};}),
    objects:[{...original.objects.find(o=>o.id==='aurelion_fountain')!,id:'aurelion_fountain',kind:'capital_fountain',x:p(47),y:p(37),name:'Aurelion Royal Fountain'}],
    areas:areas.map(([id,name,r])=>({id,name,rect:rect(r),label:{x:labels[id][0]*AURELION_SCALE,y:labels[id][1]*AURELION_SCALE}})),
  };
}
