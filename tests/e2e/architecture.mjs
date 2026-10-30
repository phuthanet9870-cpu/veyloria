// Architecture QA: atlas coverage, padding, fixed orientation, doors and town views.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..'), require = createRequire(import.meta.url);
let chromium;
for (const name of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright', '/opt/codex/cua_node/lib/node_modules/playwright'].filter(Boolean)) { try { ({ chromium } = require(name)); break; } catch {} }
if (!chromium) throw Error('Playwright required');
const port = 5189, output = join(root, 'tests/e2e/screenshots/architecture'); mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' });
let browser;
try {
 await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error('Vite startup timeout')), 20000); server.stdout.on('data', d => { if (String(d).includes(String(port))) { clearTimeout(timeout); resolve(); } }); server.on('exit', c => reject(Error(`Vite exited ${c}`))); });
 browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
 const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
 page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
 await page.goto(`http://127.0.0.1:${port}/`); await page.waitForSelector('#btn-play');
 const assets = await page.evaluate(async () => {
  const art = await import('/src/game/art/architectureArt.ts'), manifest = await import('/src/game/art/architectureManifest.ts'); await art.loadArchitectureArt();
  const output = []; let checks = 0;
  const verify = (sprite, key) => { if (!sprite) throw Error(`Missing ${key}`); const d = sprite.getContext('2d').getImageData(0, 0, sprite.width, sprite.height).data; let visible = 0; for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) { const a = d[(y * sprite.width + x) * 4 + 3]; if (a > 24) visible++; if ((x === 0 || x === sprite.width - 1 || y === 0 || y === sprite.height - 1) && a > 24) throw Error(`Clipped ${key}`); } if (!visible) throw Error(`Empty ${key}`); checks++; };
  for (const theme of manifest.ARCHITECTURE_THEMES) {
   for (const style of [...manifest.ARCHITECTURE_STYLES, 'castle']) {
    for (const [w,h] of [[5,4],[7,5],[10,6]]) verify(art.paintArchitectureBuilding({ x: 10, y: 10, w, h, style, door: Math.floor(w / 2) }, theme), `${theme}:${style}:${w}`);
    const sprite = art.paintArchitectureBuilding({ x: 10, y: 10, w: 7, h: 5, style, door: 3 }, theme); output.push({ theme, style, png: sprite.toDataURL('image/png').split(',')[1] });
   }
   for (const style of ['gate','wall']) { const sprite = art.paintArchitecturePart(theme, style, 192, style === 'gate' ? 160 : 96, style === 'gate' ? 128 : undefined); verify(sprite, `${theme}:${style}`); if (style === 'gate') { const d = sprite.getContext('2d').getImageData(36, sprite.height - 36, 128, 32).data; for (let i = 3; i < d.length; i += 4) if (d[i]) throw Error('Gate blocks its visible passage'); } output.push({ theme, style, png: sprite.toDataURL('image/png').split(',')[1] }); }
  }
  return { checks, output };
 });
 for (const asset of assets.output) { const dir = join(output, 'sprites', asset.theme); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${asset.style}.png`), Buffer.from(asset.png, 'base64')); }
 console.log(`PASS ${assets.checks} padded architecture renders; exported ${assets.output.length} sprites`);
 await page.click('#btn-play'); await page.click('.slot.empty'); await page.fill('#char-name', 'Architect'); await page.click('#btn-create'); await page.waitForSelector('#hud');
 if (await page.isVisible('#win-daily')) { await page.click('#daily-claim'); await page.click('#win-daily .x'); }
 await page.addStyleTag({ content: '.banner{display:none!important}' });
 const views = [];
 for (const id of ['willowbrook','aurelion','fernhollow','arcanthe','sandara','tidewatch','frostholm','castle_veyl']) {
  const result = await page.evaluate(id => {
   const app = window.__veyloria, w = app.world; w.godMode = true; w.enterMap(id, 'default');
   const b = w.map.buildings.find(b => b.style === (id === 'castle_veyl' ? 'castle' : 'guild'));
   w.player.x = (b.x + (b.door ?? Math.floor(b.w / 2)) + 0.5) * 32; w.player.y = (b.y + b.h + 2) * 32;
   const scene = app.game.scene.getScene('Game'); scene.buildMap(); scene.cameras.main.setZoom(id === 'castle_veyl' ? 0.9 : 1);
   const buildings = scene.children.list.filter(c => c.texture?.key.startsWith(`map_${id}_bld`));
   if (buildings.length !== w.map.buildings.length) throw Error(`Missing buildings ${id}`);
   if (buildings.some(c => c.rotation !== 0 || c.flipX || c.flipY)) throw Error(`Rotated architecture ${id}`);
   return { id, buildings: buildings.length };
  }, id);
  await page.waitForTimeout(600); await page.screenshot({ path: join(output, `${id}.png`) }); views.push(result); console.log(`PASS ${id}: ${result.buildings} south-facing buildings`);
 }
 writeFileSync(join(output, 'results.json'), JSON.stringify({ renders: assets.checks, sprites: assets.output.length, views, errors }, null, 2));
 if (errors.length) throw Error(errors.join('\n'));
} finally { if (browser) await browser.close(); server.kill(); }
