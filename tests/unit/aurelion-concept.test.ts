import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/core/data';
import { compileMap } from '../../src/core/mapCompiler';
import { buildAurelionConcept } from '../../src/data/aurelionConcept';

describe('concept-based Royal Capital Aurelion',()=>{
  const data=loadGameData(),def=data.maps.get('aurelion')!,map=compileMap(data,def);
  const near=(x:number,y:number)=>[[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>map.reachable[(y+dy)*map.width+x+dx]===1);
  it('keeps the concept proportions and a genuinely large northern palace',()=>{
    expect(def.width/def.height).toBe(1.5);
    const palace=map.buildings.find(b=>b.style==='aurelion_palace')!;
    expect(palace).toBeDefined();expect(palace.w).toBeGreaterThanOrEqual(30);
    const fountain=map.objects.find(o=>o.id==='aurelion_fountain')!;
    expect(palace.y+palace.h).toBeLessThan(fountain.y);
    expect(map.buildings.find(b=>b.style==='merchant_guild')!.x).toBeGreaterThan(fountain.x);
    expect(def.areas.find(a=>a.id==='harbor')!.rect.x).toBeLessThan(fountain.x);
    expect(def.areas.find(a=>a.id==='farm')!.rect.y).toBeLessThan(fountain.y);
  });
  it('leaves every building approach and all four city exits accessible',()=>{
    for(const b of map.buildings)expect(near(b.x+(b.door??Math.floor(b.w/2)),b.y+b.h),`${b.style} ${b.x},${b.y}`).toBe(true);
    expect(def.portals).toHaveLength(4);
    for(const portal of def.portals){let found=false;for(let y=portal.y;y<portal.y+portal.h;y++)for(let x=portal.x;x<portal.x+portal.w;x++)found ||= map.reachable[y*map.width+x]===1;expect(found,portal.id).toBe(true);}
  });
  it('does not place props inside building foundations',()=>{
    for(const o of map.objects)for(const b of map.buildings){
      const overlap=o.x<b.x+b.w&&o.x+o.w>b.x&&o.y<b.y+b.h&&o.y+o.h>b.y;
      expect(overlap,`${o.kind}@${o.x},${o.y} intersects ${b.style}`).toBe(false);
    }
  });
  it('supports every land prop and cargo footprint on walkable ground',()=>{
    const boats=new Set(['capital_ship','capital_galleon','capital_rowboat']);
    for(const o of map.objects)if(!boats.has(o.kind))for(let y=o.y;y<o.y+o.h;y++)for(let x=o.x;x<o.x+o.w;x++){
      expect(data.tiles.get(map.ground[y*map.width+x])!.walkable,`${o.kind}@${x},${y} floats over water`).toBe(true);
    }
  });
  it('places bridge walkways on reachable ground and connects the harbor piers',()=>{
    for(const part of def.scenery!.filter(p=>p.kind.startsWith('bridge_'))){
      const x=Math.round(part.x+part.w/2),y=Math.round(part.y-part.h/2);
      expect(near(x,y),`${part.kind} ${x},${y}`).toBe(true);
      expect(map.ground[y*map.width+x]).not.toBe('water');
    }
    expect(map.ground[73*map.width+17]).toBe('wood_plank');
    expect(map.reachable[73*map.width+17]).toBe(1);
  });
  it('regenerates the authored layout without moving NPCs or duplicating scenery',()=>{
    const again=buildAurelionConcept(def);
    expect(again.paint).toEqual(def.paint);expect(again.npcs).toEqual(def.npcs);expect(again.scenery).toEqual(def.scenery);
    expect(new Set(def.npcs.map(n=>n.npcId)).size).toBe(17);
  });
});
