// Live concept-city validation and reusable object exports; Playwright required.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url);
let chromium;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright','/opt/node-tools/node_modules/playwright','/opt/codex/cua_node/lib/node_modules/playwright'].filter(Boolean)){try{({chromium}=require(name));break;}catch{}}
if(!chromium)throw Error('Playwright required');
const port=5191,out=join(root,'tests/e2e/screenshots/aurelion');mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'pipe'});
let browser;
try{
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Vite timeout')),20000);server.stdout.on('data',d=>{if(String(d).includes(String(port))){clearTimeout(t);resolve();}});server.on('exit',c=>reject(Error(`Vite ${c}`)));});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1920,height:1280}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${port}/`);await page.waitForSelector('#btn-play');
 const exports=await page.evaluate(async()=>{
  const art=await import('/src/game/art/aurelionArt.ts');await art.loadAurelionArt();const result=[];
  for(let i=0;i<=16;i++){const source=art.aurelionFrame(i);if(!source)throw Error(`Missing capital asset ${i}`);const c=document.createElement('canvas');c.width=source.width+16;c.height=source.height+16;c.getContext('2d').drawImage(source,8,8);result.push(c.toDataURL('image/png').split(',')[1]);}return result;
 });
 const names=['cathedral','windmill','stall-red','stall-gold','stall-blue','trading-ship','galleon','rowboat','lighthouse','training-dummy','royal-statue','bridge-ew','bridge-ns','wooden-dock','farmhouse','monster-cave','grand-palace'];
 mkdirSync(join(out,'objects'),{recursive:true});exports.forEach((png,i)=>writeFileSync(join(out,'objects',names[i]+'.png'),Buffer.from(png,'base64')));
 await page.click('#btn-play');await page.click('.slot.empty');await page.fill('#char-name','Capital QA');await page.click('#btn-create');await page.waitForSelector('#hud');
 if(await page.isVisible('#win-daily')){await page.click('#daily-claim');await page.click('#win-daily .x');}
 await page.evaluate(()=>{const a=window.__veyloria;a.world.godMode=true;a.world.enterMap('aurelion','default');a.game.scene.getScene('Game').buildMap();});
 const npcs=await page.evaluate(()=>window.__veyloria.world.map.def.npcs.map(n=>n.npcId));
 for(const id of npcs){
  await page.evaluate(id=>{const w=window.__veyloria.world,n=w.map.def.npcs.find(n=>n.npcId===id);const [dx,dy]=[[0,1],[1,0],[-1,0],[0,-1]].find(([dx,dy])=>w.map.reachable[(n.y+dy)*w.map.width+n.x+dx]);w.player.x=(n.x+dx+.5)*32;w.player.y=(n.y+dy+.5)*32;w.interactNpc(id);},id);
  await page.waitForSelector('#npc-dialog',{timeout:10000});await page.keyboard.press('Escape');console.log(`PASS NPC dialogue ${id}`);
 }
 await page.addStyleTag({content:'#hud,.banner,.toast-area{visibility:hidden!important}'});
 await page.evaluate(()=>{const a=window.__veyloria,s=a.game.scene.getScene('Game'),m=a.world.map;a.paused=true;s.cameras.main.stopFollow();s.cameras.main.setZoom(Math.min(1280/(m.width*32),720/(m.height*32)));s.cameras.main.centerOn(m.width*16,m.height*16);s.updateChunks(true);s.player.setVisible(false);s.playerName.setVisible(false);for(const v of s.npcViews.values()){v.name.setVisible(false);v.marker.setVisible(false);}});
 await page.waitForTimeout(800);
 const clip=await page.evaluate(()=>{const a=window.__veyloria,c=a.game.scene.getScene('Game').cameras.main,r=document.querySelector('#game canvas').getBoundingClientRect();return{x:Math.round(r.x-c.worldView.x*c.zoom*r.width/1280),y:Math.round(r.y-c.worldView.y*c.zoom*r.height/720),width:Math.round(a.world.map.width*32*c.zoom*r.width/1280),height:Math.round(a.world.map.height*32*c.zoom*r.height/720)};});
 await page.screenshot({path:join(out,'overview.png'),clip});
 for(const id of ['palace','market','harbor','guilds','cathedral','farm','training']){
  await page.evaluate(id=>{const a=window.__veyloria,s=a.game.scene.getScene('Game'),area=a.world.map.def.areas.find(r=>r.id===id);s.cameras.main.setZoom(id==='palace'?.9:1);s.cameras.main.centerOn((area.rect.x+area.rect.w/2)*32,(area.rect.y+area.rect.h/2)*32);s.updateChunks(true);},id);
  await page.waitForTimeout(200);await page.locator('#game canvas').screenshot({path:join(out,id+'.png')});
 }
 const state=await page.evaluate(()=>{const m=window.__veyloria.world.map;return{width:m.width,height:m.height,buildings:m.buildings.length,props:m.objects.length,npcs:m.def.npcs.length,scenery:m.def.scenery.length};});
 writeFileSync(join(out,'results.json'),JSON.stringify({state,dialogues:npcs.length,exports:exports.length,errors},null,2));console.log(JSON.stringify({state,dialogues:npcs.length,exports:exports.length,errors}));if(errors.length)throw Error(errors.join('\n'));
}finally{if(browser)await browser.close();server.kill();}
