// One port serves the built game, the health probe and the WebSocket endpoint.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { get } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../server/server';

let srv: Awaited<ReturnType<typeof startServer>>;
let root: string;

beforeAll(async () => {
  const base = mkdtempSync(join(tmpdir(), 'veyl-web-'));
  root = join(base, 'dist');
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Veyloria test page</title>');
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log("ok");');
  writeFileSync(join(base, 'secret.txt'), 'outside the web root');
  srv = await startServer({ port: 0, host: '127.0.0.1', staticDir: root, dataDir: join(base, 'data') });
});
afterAll(async () => { await srv.close(); });

/** Raw request, so the path is sent exactly as written (fetch would normalise "../"). */
const raw = (path: string) => new Promise<{ status: number; type: string; body: string }>((resolve, reject) => {
  get({ host: '127.0.0.1', port: srv.port, path }, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body }));
  }).on('error', reject);
});

describe('web hosting on the game port', () => {
  it('serves index.html at / with the right type', async () => {
    const r = await raw('/');
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/text\/html/);
    expect(r.body).toContain('Veyloria test page');
  });

  it('serves nested assets with their content type', async () => {
    const r = await raw('/assets/app.js');
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/javascript/);
  });

  it('answers unknown paths with 404', async () => {
    expect((await raw('/nope.png')).status).toBe(404);
  });

  it('refuses paths that climb out of the web root', async () => {
    const r = await raw('/..%2Fsecret.txt');
    expect(r.status).toBe(403);
    expect(r.body).not.toContain('outside the web root');
  });

  it('answers the health probe', async () => {
    const r = await raw('/healthz');
    expect(r.status).toBe(200);
    expect(r.body).toBe('ok');
  });

  it('accepts WebSocket connections on the same port as the page', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/`);
    await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); });
    ws.send(JSON.stringify({ t: 'register', user: 'WebUser1', pass: 'secret123' }));
    const reply = await new Promise<string>((resolve) => ws.once('message', (d) => resolve(String(d))));
    expect(JSON.parse(reply).t).toBe('welcome');
    ws.close();
  });
});
