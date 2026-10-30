// Reproduce opening the downloaded game via file:// with normal browser security.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { copyFileSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
let chromium;
for (const name of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright', '/opt/codex/cua_node/lib/node_modules/playwright'].filter(Boolean)) {
  try { ({ chromium } = require(name)); break; } catch {}
}
if (!chromium) throw Error('Playwright is required for the standalone browser test.');
const dir = mkdtempSync(join(tmpdir(), 'Veyloria standalone ทดสอบ '));
const file = join(dir, 'index.html'); copyFileSync(join(root, 'dist-standalone/index.html'), file);
const output = join(root, 'tests/e2e/screenshots/standalone'); mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const results = [], errors = [], network = [];
const httpMode = process.env.STANDALONE_TEST_MODE === 'http';
let server; let url = pathToFileURL(file).href;
if (httpMode) {
  server = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(readFileSync(file)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/`;
  console.log('HTTP validation mode: this does not establish a direct file:// test.');
}
const check = (name, ok) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) throw Error(name); };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: !httpMode });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (/^https?:/.test(r.url()) && r.url() !== url) network.push(r.url()); });
  await page.goto(url); if (httpMode) await context.setOffline(true); await page.waitForSelector('#btn-play', { timeout: 30000 });
  check(httpMode ? 'single HTML startup, with no external styles/scripts/artwork' : 'double-click file:// startup with spaces and Thai path, fully offline', true);
  check('CSS is embedded and loaded', await page.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'));
  await page.screenshot({ path: join(output, 'title.png') });
  await page.click('#btn-play'); await page.click('.slot.empty'); await page.fill('#char-name', 'File Hero'); await page.click('#btn-create'); await page.waitForSelector('#hud');
  check('creates character and renders Willowbrook with embedded artwork', await page.evaluate(() => window.__veyloria.world.map.def.id === 'willowbrook' && window.__veyloria.world.char.hp > 0));
  if (await page.isVisible('#win-daily')) { await page.click('#daily-claim'); await page.click('#win-daily .x'); }
  const before = await page.evaluate(() => window.__veyloria.world.player.x);
  await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d');
  check('keyboard movement works', await page.evaluate(x => window.__veyloria.world.player.x > x + 10, before));
  await page.screenshot({ path: join(output, 'game.png') });
  await page.evaluate(() => window.__veyloria.saveNow(true)); if (httpMode) await context.setOffline(false); await page.reload(); if (httpMode) await context.setOffline(true); await page.waitForSelector('#btn-play'); await page.click('#btn-play');
  check(httpMode ? 'local save persists after standalone HTML reload' : 'local save persists after file:// reload', (await page.textContent('.slot .name')) === 'File Hero');
  await page.click('#btn-enter'); await page.waitForSelector('#hud');
  const themes = await page.evaluate(async () => {
    const app = window.__veyloria, scene = app.game.scene.getScene('Game');
    app.world.godMode = true;
    const representatives = [...new Map([...app.data.maps.values()].map(def => [def.tileset, def])).values()];
    for (const def of representatives) {
      app.world.instance = def.instanceId ? { id: def.instanceId, floor: def.floor ?? 1, endsAt: app.world.time + 3600000, cleared: false, done: false } : null;
      app.world.enterMap(def.id, 'default'); scene.buildMap();
    }
    return representatives.length;
  });
  check('all 21 environment themes can render from embedded images without canvas taint', themes === 21);
  check('no external asset HTTP requests', network.length === 0);
  check('no console or page errors', errors.length === 0);
} finally {
  writeFileSync(join(output, 'results.json'), JSON.stringify({ mode: httpMode ? 'http' : 'file', results, errors, network }, null, 2));
  await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true });
}
