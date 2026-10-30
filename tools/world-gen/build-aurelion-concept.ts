import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildAurelionConcept} from '../../src/data/aurelionConcept';
import {loadGameData,validateGameData} from '../../src/core/data';
import {compileMap} from '../../src/core/mapCompiler';
import type {MapDef} from '../../src/core/types';
export function main(){
 const path=join(process.cwd(),'src/data/maps/aurelion.json');
 const map=buildAurelionConcept(JSON.parse(readFileSync(path,'utf8')) as MapDef);
 const data=loadGameData();data.maps.set(map.id,map);
 const errors=validateGameData(data);if(errors.length)throw new Error(errors.join('\n'));
 const cm=compileMap(data,map);const bad:string[]=[];
 const near=(x:number,y:number)=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>cm.reachable[(y+dy)*cm.width+x+dx]);
 for(const [id,s]of Object.entries(map.spawnPoints))if(!cm.reachable[s.y*cm.width+s.x])bad.push(`spawn ${id} ${s.x},${s.y}`);
 for(const n of map.npcs)if(!near(n.x,n.y))bad.push(`npc ${n.npcId} ${n.x},${n.y}`);
 // Persist the authored draft even when validation identifies a route to repair.
 writeFileSync(path,JSON.stringify(map,null,1)+'\n');
 console.log(`${map.width}x${map.height}, ${cm.buildings.length} buildings, ${cm.objects.length} objects, ${map.npcs.length} NPCs`);
 if(bad.length)throw new Error(bad.join('\n'));
}
