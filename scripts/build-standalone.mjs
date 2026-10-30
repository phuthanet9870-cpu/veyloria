// Single-file distribution for opening index.html directly from Finder/Explorer.
// All code, styles and image atlases are embedded; no server or CORS changes.
import { build } from 'vite';
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-standalone');
await build({
  configFile: false,
  root,
  base: './',
  build: {
    outDir: out, emptyOutDir: true, copyPublicDir: false, target: 'es2022',
    lib: { entry: join(root, 'src/main.ts'), name: 'Veyloria', formats: ['iife'], fileName: () => 'game.js', cssFileName: 'game' },
    chunkSizeWarningLimit: 20000,
  },
});
const names = await readdir(out);
if (names.some(name => !['game.js', 'game.css'].includes(name))) {
  throw new Error('Unexpected standalone output: artwork must be embedded, not loaded from external files.');
}
const [js, css, icon] = await Promise.all([
  readFile(join(out, 'game.js'), 'utf8'), readFile(join(out, 'game.css'), 'utf8'), readFile(join(root, 'public/favicon.svg')),
]);
const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Veyloria Online</title>
<link rel="icon" href="data:image/svg+xml;base64,${icon.toString('base64')}">
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head><body>
<div id="stage"><div id="frame"><div id="game"></div><div id="ui"></div></div></div>
<noscript>กรุณาเปิด JavaScript เพื่อเล่น Veyloria / Enable JavaScript to play.</noscript>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body></html>`;
await writeFile(join(out, 'index.html'), html);
await Promise.all(names.map(name => unlink(join(out, name))));
console.log(`Standalone game: ${join(out, 'index.html')} (${Buffer.byteLength(html)} bytes)`);
