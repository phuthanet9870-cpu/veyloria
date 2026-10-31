// `npm run server` / `npm start` entry: starts the Veyloria server and keeps it running.
// Options (flags or environment variables):
//   --port=7171           PORT                   port to listen on (hosts set PORT for you)
//   --host=0.0.0.0        HOST                   interface to listen on
//   --static=dist         VEYLORIA_STATIC        built game to serve on the same port (default: ./dist if it exists)
//   --data=./server-data  VEYLORIA_DATA          accounts, guilds, market (mount a volume here when hosting)
//   --woe-always                                 guild war always open
//   --emperium-hp=50000
//   --admin-token=SECRET  VEYLORIA_ADMIN_TOKEN   enables server GM commands for clients with this token
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './server';

export async function main(args: string[] = []) {
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const port = Number(opt('port') ?? process.env.PORT ?? 7171);
  const host = opt('host') ?? process.env.HOST ?? '0.0.0.0';
  const staticArg = opt('static') ?? process.env.VEYLORIA_STATIC ?? (existsSync(resolve('dist/index.html')) ? 'dist' : undefined);
  const staticDir = staticArg ? resolve(staticArg) : undefined;
  const dataDir = opt('data') ?? process.env.VEYLORIA_DATA;
  const srv = await startServer({
    port, host, staticDir, dataDir,
    woeAlways: args.includes('--woe-always'),
    emperiumHp: opt('emperium-hp') ? Number(opt('emperium-hp')) : undefined,
    adminToken: opt('admin-token') ?? process.env.VEYLORIA_ADMIN_TOKEN,
  });
  const where = staticDir ? `http://localhost:${srv.port} (game + server on one port)` : `ws://localhost:${srv.port} (no web build found: run \`npm run build\` to serve the game here)`;
  console.log(`Veyloria server listening on ${where}${args.includes('--woe-always') ? ' · guild war always open' : ''}`);
  await new Promise(() => {});
}
