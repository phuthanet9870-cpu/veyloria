// Browser pixel regression: map/chunk cuts, opaque ground, atlas coverage and sprites.
// Run: npm run test:maps. Optional PLAYWRIGHT_MODULE / PLAYWRIGHT_CHROMIUM_EXECUTABLE.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
let playwright;
for (const name of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright', '/opt/codex/cua_node/lib/node_modules/playwright'].filter(Boolean)) {
  try { playwright = require(name); break; } catch {}
}
if (!playwright) throw Error('Install Playwright outside the checkout or set PLAYWRIGHT_MODULE.');
const port = Number(process.env.MAP_QA_PORT ?? 5187);
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' });
let browser;
const output = join(root, 'tests/e2e/screenshots/environment'); mkdirSync(output, { recursive: true });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Map QA server timeout')), 20000);
    server.stdout.on('data', d => { if (String(d).includes(String(port))) { clearTimeout(timeout); resolve(); } });
    server.stderr.on('data', d => process.stderr.write(d));
    server.on('exit', code => { clearTimeout(timeout); reject(Error(`Map QA server exited ${code}`)); });
  });
  browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${port}/`); await page.waitForSelector('#btn-play');
  await page.evaluate(async () => {
    const [{ loadGameData }, { compileMap }, painters, art, manifest] = await Promise.all([
      import('/src/core/data.ts'), import('/src/core/mapCompiler.ts'), import('/src/game/art/mapPainter.ts'), import('/src/game/art/environmentArt.ts'), import('/src/game/art/environmentManifest.ts'),
    ]);
    await art.loadEnvironmentArt();
    window.mapQA = { data: loadGameData(), compileMap, painters, art, manifest };
  });
  const spriteChecks = await page.evaluate(() => {
    const { art, manifest, data } = window.mapQA; let count = 0;
    for (const theme of Object.keys(manifest.ENVIRONMENT_THEMES)) for (const kind of data.objectKinds.values()) {
      if (kind.draw === 'glint') continue;
      for (let variant = 0; variant < 8; variant++) {
        const sprite = art.paintEnvironmentObject(kind, theme, variant);
        if (!sprite) throw Error(`Missing generated prop ${theme}:${kind.id}`);
        const d = sprite.getContext('2d').getImageData(0, 0, sprite.width, sprite.height).data;
        let visible = 0;
        for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
          const alpha = d[(y * sprite.width + x) * 4 + 3]; if (alpha > 24) visible++;
          if ((x === 0 || y === 0 || x === sprite.width - 1 || y === sprite.height - 1) && alpha > 24) throw Error(`Clipped sprite ${theme}:${kind.id}:${variant}`);
        }
        if (!visible) throw Error(`Empty sprite ${theme}:${kind.id}`); count++;
      }
    }
    return count;
  });
  console.log(`PASS ${spriteChecks} normalized prop variants with transparent padding`);
  const ids = await page.evaluate(() => [...window.mapQA.data.maps.keys()]);
  const results = [];
  for (const id of ids) {
    const result = await page.evaluate(id => {
      const { data, compileMap, painters, art, manifest } = window.mapQA;
      const def = data.maps.get(id), map = compileMap(data, def), palette = data.tilesets.get(def.tileset).palette;
      let comparisons = 0, pixels = 0;
      const fail = detail => { throw Error(`${id}: ${detail}`); };
      const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const checkRegion = region => {
        for (const name of ['paintGroundLayer', 'paintWallLayer', 'paintAboveLayer']) {
          const full = painters[name](map, palette, region), joined = canvas(full.width, full.height), ctx = joined.getContext('2d');
          const hx = Math.max(1, Math.floor(region.w / 2)), hy = Math.max(1, Math.floor(region.h / 2));
          for (const [dx, dy, w, h] of [[0, 0, hx, hy], [hx, 0, region.w - hx, hy], [0, hy, hx, region.h - hy], [hx, hy, region.w - hx, region.h - hy]]) {
            if (w <= 0 || h <= 0) continue;
            const part = painters[name](map, palette, { x: region.x + dx, y: region.y + dy, w, h });
            ctx.drawImage(part, dx * 32, dy * 32);
          }
          const a = full.getContext('2d').getImageData(0, 0, full.width, full.height).data, b = ctx.getImageData(0, 0, joined.width, joined.height).data;
          for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) fail(`${name} chunk mismatch at region ${JSON.stringify(region)}, byte ${i}: ${a[i]}/${b[i]}`);
            if (name === 'paintGroundLayer' && i % 4 === 3 && a[i] !== 255) fail('transparent hole in ground');
          }
          comparisons++; pixels += a.length / 4;
        }
      };
      // Every pixel along every 16-tile cut, intersections, map corners and spawn.
      for (let x = 16; x < map.width; x += 16) checkRegion({ x: x - 1, y: 0, w: 2, h: map.height });
      for (let y = 16; y < map.height; y += 16) checkRegion({ x: 0, y: y - 1, w: map.width, h: 2 });
      for (let y = 16; y < map.height; y += 16) for (let x = 16; x < map.width; x += 16) checkRegion({ x: x - 2, y: y - 2, w: Math.min(4, map.width - x + 2), h: Math.min(4, map.height - y + 2) });
      checkRegion({ x: 0, y: 0, w: Math.min(4, map.width), h: Math.min(4, map.height) });
      checkRegion({ x: map.width - 4, y: map.height - 4, w: 4, h: 4 });
      const spawn = def.spawnPoints.default;
      checkRegion({ x: Math.max(0, Math.min(map.width - 4, spawn.x - 2)), y: Math.max(0, Math.min(map.height - 4, spawn.y - 2)), w: 4, h: 4 });
      for (const material of new Set(map.ground)) if (!art.environmentSurface(def.tileset, material, palette)) fail(`missing material ${material}`);
      for (const object of map.objects) {
        const kind = data.objectKinds.get(object.kind), image = art.paintEnvironmentObject(kind, def.tileset, 0) ?? painters.paintObject(kind, palette, 1000);
        if (image.width !== kind.spriteW || image.height !== kind.spriteH) fail(`wrong object bounds ${kind.id}`);
      }
      // Full perimeter strips catch holes and row-wrap errors at every map edge.
      for (const edge of [{ x: 0, y: 0, w: map.width, h: 1 }, { x: 0, y: map.height - 1, w: map.width, h: 1 }, { x: 0, y: 0, w: 1, h: map.height }, { x: map.width - 1, y: 0, w: 1, h: map.height }]) {
        const c = painters.paintGroundLayer(map, palette, edge), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) fail('missing perimeter pixel');
      }
      if (!manifest.ENVIRONMENT_THEMES[def.tileset]) fail('unmapped theme');
      return { id, theme: def.tileset, comparisons, pixels, objects: map.objects.length };
    }, id);
    results.push(result); console.log(`PASS ${id}: ${result.comparisons} pixel comparisons`);
  }
  // Real game screenshots for one map of each theme plus the final instance floor.
  await page.click('#btn-play'); await page.click('.slot.empty'); await page.fill('#char-name', 'Map QA'); await page.click('#btn-create'); await page.waitForSelector('#hud');
  if (await page.isVisible('#win-daily')) { await page.click('#daily-claim'); await page.click('#win-daily .x'); }
  const representatives = [...new Map(results.map(r => [r.theme, r.id])).values()];
  representatives.push('endless_spire_f100');
  for (const id of representatives) {
    await page.evaluate(id => { const app = window.__veyloria; app.world.godMode = true; const def = app.data.maps.get(id); app.world.instance = def.instanceId ? { id: def.instanceId, floor: def.floor ?? 1, endsAt: app.world.time + 3600000, cleared: false, done: false } : null; app.world.enterMap(id, 'default'); }, id);
    await page.waitForFunction(id => window.__veyloria.game.scene.getScene('Game').world.map.def.id === id, id, { timeout: 10000 });
    await page.waitForTimeout(1000); console.log(`SCREENSHOT ${id}`); await page.screenshot({ path: join(output, `${id}.png`) });
  }
  const summary = { spriteChecks, maps: results.length, comparisons: results.reduce((n, r) => n + r.comparisons, 0), pixels: results.reduce((n, r) => n + r.pixels, 0), themes: new Set(results.map(r => r.theme)).size, errors, results };
  writeFileSync(join(output, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, results: undefined }));
  if (errors.length) throw Error(errors.join('\n'));
} finally { if (browser) await browser.close(); server.kill(); }
