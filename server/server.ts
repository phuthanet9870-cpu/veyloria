// Veyloria server: accounts, presence, chat, parties, guilds, trades, vending,
// PvP relay and the guild war (WoE) over Castle Veyl. Start with
// `npm run server` (default port 7171). Data (accounts, guilds, castle owner)
// is kept in JSON files under the data directory.
//
// Trust model: each client owns its character (stats, inventory, Luma). The
// server checks what it can see — logged in, online, same map, distance,
// listing quantities, guild membership, WoE time — and relays the rest.
import { WebSocketServer, type WebSocket } from 'ws';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  CASTLE_MAP, EMPERIUM_POS, MARKET_MAX_LISTINGS, PARTY_LEVEL_GAP, PVP_MAPS,
  type ClientMsg, type MarketListing, type GuildInfo, type Listing, type PartyInfo, type PresenceInfo, type ServerMsg, type TradeOffer, type WoeState,
} from '../src/net/protocol';

export interface ServerOptions {
  port?: number;
  /** Interface to listen on. Default: all interfaces (needed on a hosting platform). */
  host?: string;
  /** Built game (`npm run build` output). When set, the same port serves the web game. */
  staticDir?: string;
  dataDir?: string;
  /** Guild war always open (tests / events). Otherwise daily 20:00–21:00 server time. */
  woeAlways?: boolean;
  emperiumHp?: number;
  now?: () => number;
  /** Enables server GM commands for clients that send this token. Unset = no server GM. */
  adminToken?: string;
}

interface Account { user: string; salt: string; hash: string }
interface Guild { id: string; name: string; master: string; members: string[]; notice: string }
interface Session {
  ws: WebSocket; user: string | null; info: PresenceInfo | null;
  chatTimes: number[]; partyId: string | null;
  trade: { with: string; offer: TradeOffer } | null; tradeRequestFrom: Set<string>;
  shop: { title: string; listings: Listing[] } | null;
  partyInvite: string | null; guildInvite: string | null; lastPartyPush: number;
}

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const send = (s: Session, m: ServerMsg) => { if (s.ws.readyState === s.ws.OPEN) s.ws.send(JSON.stringify(m)); };

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

/** Serves files from `root`. Paths outside it are refused; unknown paths get 404 (the game has no client-side routes). */
function staticHandler(root: string) {
  const base = resolve(root);
  return async (req: IncomingMessage, res: ServerResponse) => {
    const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const file = resolve(base, '.' + (rel === '/' ? '/index.html' : rel));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end('Forbidden'); return; }
    try {
      const body = await readFile(file);
      const ext = extname(file);
      res.writeHead(200, {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  };
}

export function startServer(opts: ServerOptions = {}): Promise<{ port: number; close: () => Promise<void>; state: { woe: WoeState } }> {
  const now = opts.now ?? (() => Date.now());
  const dataDir = opts.dataDir ?? join(process.cwd(), 'server-data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const file = (n: string) => join(dataDir, n);
  const load = <T>(n: string, d: T): T => { try { return JSON.parse(readFileSync(file(n), 'utf8')) as T; } catch { return d; } };
  const accounts: Record<string, Account> = load('accounts.json', {});
  const guilds: Record<string, Guild> = load('guilds.json', {});
  const castle: { owner: string | null } = load('castle.json', { owner: null });
  // Market Hall: listings held in escrow, sale history for the price graph, payouts for sellers who were offline.
  const market: { listings: MarketListing[]; history: Record<string, [number, number][]>; payouts: Record<string, { itemId: string; qty: number; total: number; buyer: string }[]>; next: number } =
    load('market.json', { listings: [], history: {}, payouts: {}, next: 1 });
  const saveMarket = () => writeFileSync(file('market.json'), JSON.stringify(market));
  const save = () => {
    writeFileSync(file('accounts.json'), JSON.stringify(accounts));
    writeFileSync(file('guilds.json'), JSON.stringify(guilds));
    writeFileSync(file('castle.json'), JSON.stringify(castle));
  };

  const sessions = new Set<Session>();
  const parties = new Map<string, { id: string; leader: string; members: Set<string> }>();
  const emperiumMax = opts.emperiumHp ?? 50000;
  let emperiumHp = emperiumMax;

  const online = (name: string) => [...sessions].find((s) => s.info?.name === name);
  const guildOf = (name: string) => Object.values(guilds).find((g) => g.members.includes(name)) ?? null;
  let woeOverride: boolean | null = null;
  const woeActive = () => woeOverride ?? (opts.woeAlways || new Date(now()).getHours() === 20);
  const woeState = (): WoeState => {
    const d = new Date(now());
    const end = opts.woeAlways || woeOverride !== null ? null : woeActive() ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21).getTime() : null;
    return { active: woeActive(), owner: castle.owner ? guilds[castle.owner]?.name ?? null : null, emperiumHp, emperiumMax, endsAt: end };
  };
  const guildInfo = (g: Guild | null): GuildInfo | null => g && { id: g.id, name: g.name, master: g.master, members: [...g.members], online: g.members.filter((m) => !!online(m)), notice: g.notice };
  const partyInfo = (pid: string | null): PartyInfo | null => {
    const p = pid ? parties.get(pid) : undefined;
    if (!p) return null;
    return { id: p.id, leader: p.leader, members: [...p.members].map((n) => { const s = online(n); return { name: n, level: s?.info?.level ?? 0, mapId: s?.info?.mapId ?? '', hpPct: s?.info?.hpPct ?? 0, online: !!s }; }) };
  };
  const toMap = (mapId: string, m: ServerMsg, except?: Session) => { for (const s of sessions) if (s !== except && s.info?.mapId === mapId) send(s, m); };
  const toAll = (m: ServerMsg) => { for (const s of sessions) if (s.info) send(s, m); };
  const pushParty = (pid: string) => { const p = parties.get(pid); if (!p) return; const info = partyInfo(pid); for (const n of p.members) { const s = online(n); if (s) send(s, { t: 'party.update', party: info }); } };
  const pushGuild = (g: Guild) => { const info = guildInfo(g); for (const n of g.members) { const s = online(n); if (s) send(s, { t: 'guild.update', guild: info }); } };
  const near = (a: PresenceInfo, b: PresenceInfo, r: number) => a.mapId === b.mapId && Math.hypot(a.x - b.x, a.y - b.y) <= r;
  const err = (s: Session, text: string) => send(s, { t: 'error', text });

  const leaveParty = (s: Session) => {
    const pid = s.partyId; const name = s.info?.name;
    if (!pid || !name) return;
    const p = parties.get(pid);
    s.partyId = null;
    send(s, { t: 'party.update', party: null });
    if (!p) return;
    p.members.delete(name);
    if (p.members.size <= 1) { for (const n of p.members) { const o = online(n); if (o) { o.partyId = null; send(o, { t: 'party.update', party: null }); } } parties.delete(pid); return; }
    if (p.leader === name) p.leader = [...p.members][0];
    pushParty(pid);
  };
  const cancelTrade = (s: Session, reason: string) => {
    if (!s.trade) return;
    const other = online(s.trade.with);
    s.trade = null; send(s, { t: 'trade.closed', reason });
    if (other?.trade) { other.trade = null; send(other, { t: 'trade.closed', reason }); }
  };
  const pushTrade = (a: Session, b: Session) => {
    send(a, { t: 'trade.update', mine: a.trade!.offer, theirs: b.trade!.offer });
    send(b, { t: 'trade.update', mine: b.trade!.offer, theirs: a.trade!.offer });
  };

  const gmCommand = (s: Session, m: Extract<ClientMsg, { t: 'gm' }>) => {
    const reply = (ok: boolean, text: string) => send(s, { t: 'gm.result', ok, text });
    if (!opts.adminToken) return reply(false, 'Server GM is disabled (start the server with --admin-token=...).');
    const tok = Buffer.from(String(m.token ?? '')), want = Buffer.from(opts.adminToken);
    if (tok.length !== want.length || !timingSafeEqual(tok, want)) return reply(false, 'Wrong admin token.');
    const a = Array.isArray(m.args) ? m.args.map(String) : [];
    switch (m.cmd) {
      case 'announce': {
        const text = a.join(' ').slice(0, 300);
        if (!text) return reply(false, 'announce <text>');
        toAll({ t: 'chat', channel: 'global', from: 'GM', text });
        return reply(true, 'Announced.');
      }
      case 'players': return reply(true, [...sessions].filter((o) => o.info).map((o) => `${o.info!.name} (Lv ${o.info!.level}, ${o.info!.mapId})`).join(', ') || 'Nobody online.');
      case 'kick': {
        const o = online(a[0] ?? '');
        if (!o) return reply(false, `${a[0]} is not online.`);
        send(o, { t: 'kicked', reason: a.slice(1).join(' ') || 'Kicked by a GM.' });
        o.ws.close();
        return reply(true, `Kicked ${a[0]}.`);
      }
      case 'woe': {
        if (a[0] === 'open') woeOverride = true; else if (a[0] === 'close') woeOverride = false; else if (a[0] === 'auto') woeOverride = null; else return reply(false, 'woe open|close|auto');
        toAll({ t: 'woe.state', woe: woeState() });
        if (a[0] !== 'auto') toAll({ t: 'chat', channel: 'global', from: 'Herald', text: a[0] === 'open' ? 'The guild war has begun!' : 'The guild war is over.' });
        return reply(true, `Guild war ${a[0]}.`);
      }
      case 'castle': {
        const name = a.join(' ');
        if (name === 'none') castle.owner = null;
        else { const g = Object.values(guilds).find((x) => x.name.toLowerCase() === name.toLowerCase()); if (!g) return reply(false, `No guild named ${name}.`); castle.owner = g.id; }
        save(); toAll({ t: 'woe.state', woe: woeState() });
        return reply(true, `Castle owner: ${name}.`);
      }
      case 'emperium': emperiumHp = emperiumMax; toAll({ t: 'woe.state', woe: woeState() }); return reply(true, 'Emperium restored.');
      default: return reply(false, 'Server GM commands: announce, players, kick, woe, castle, emperium.');
    }
  };

  const handle = (s: Session, m: ClientMsg) => {
    if (m.t === 'register' || m.t === 'login') {
      const user = String(m.user ?? '').trim();
      if (!NAME_RE.test(user)) return err(s, 'Account names are 3–16 letters, digits or _.');
      if (String(m.pass ?? '').length < 6) return err(s, 'Passwords need at least 6 characters.');
      const key = user.toLowerCase();
      if (m.t === 'register') {
        if (accounts[key]) return err(s, 'That account name is taken.');
        const salt = randomBytes(16).toString('hex');
        accounts[key] = { user, salt, hash: scryptSync(m.pass, salt, 32).toString('hex') };
        save();
      } else {
        const a = accounts[key];
        if (!a || !timingSafeEqual(Buffer.from(a.hash, 'hex'), scryptSync(m.pass, a.salt, 32))) return err(s, 'Wrong account name or password.');
        if ([...sessions].some((o) => o !== s && o.user === a.user)) return err(s, 'That account is already online.');
      }
      s.user = accounts[key].user;
      return send(s, { t: 'welcome', user: s.user });
    }
    if (m.t === 'gm') return gmCommand(s, m);
    if (!s.user) return err(s, 'Log in first.');
    if (m.t === 'join') {
      const info = m.info;
      if (!NAME_RE.test(info.name.replace(/ /g, '_'))) return err(s, 'Invalid character name.');
      if (online(info.name) && online(info.name) !== s) return err(s, 'A character with that name is online.');
      const g = guildOf(info.name);
      s.info = { ...info, guild: g?.name, party: undefined, vending: undefined, title: typeof info.title === 'string' && info.title ? info.title.slice(0, 24) : undefined };
      toMap(info.mapId, { t: 'player', info: s.info }, s);
      // Goods that sold while this seller was away.
      const paid = market.payouts[info.name];
      if (paid?.length) { setTimeout(() => { for (const p of paid) send(s, { t: 'market.sold', ...p }); }, 50); delete market.payouts[info.name]; saveMarket(); }
      return send(s, { t: 'joined', you: info.name, players: [...sessions].filter((o) => o !== s && o.info).map((o) => o.info!), woe: woeState(), guild: guildInfo(g) });
    }
    const me = s.info;
    if (!me) return err(s, 'Join with a character first.');
    switch (m.t) {
      case 'market.browse': return send(s, { t: 'market.listings', listings: market.listings.slice(-300) });
      case 'market.history': return send(s, { t: 'market.history', itemId: String(m.itemId), points: market.history[String(m.itemId)] ?? [] });
      case 'market.list': {
        const qty = Math.floor(Number(m.qty)), price = Math.floor(Number(m.price));
        if (!m.inst || typeof m.inst.itemId !== 'string' || typeof m.inst.uid !== 'string') return err(s, 'Invalid item.');
        if (!(qty >= 1 && qty <= 9999) || !(price >= 1 && price <= 1_000_000_000)) return err(s, 'Quantity 1–9999 and a price of at least 1 Luma.');
        const mine = market.listings.filter((l) => l.seller === me.name);
        if (mine.length >= MARKET_MAX_LISTINGS) return err(s, `You can list up to ${MARKET_MAX_LISTINGS} items at once.`);
        if (mine.some((l) => l.inst.uid === m.inst.uid)) return err(s, 'That item is already listed.');
        const listing: MarketListing = { id: `L${market.next++}`, seller: me.name, itemId: m.inst.itemId, inst: { ...m.inst, qty: 1 }, qty, price, listedAt: now() };
        market.listings.push(listing); saveMarket();
        return send(s, { t: 'market.listed', listing });
      }
      case 'market.cancel': {
        const i = market.listings.findIndex((l) => l.id === m.id && l.seller === me.name);
        if (i < 0) return err(s, 'Listing not found.');
        const [l] = market.listings.splice(i, 1); saveMarket();
        return send(s, { t: 'market.returned', inst: l.inst, qty: l.qty, reason: 'Listing cancelled.' });
      }
      case 'market.buy': {
        const l = market.listings.find((x) => x.id === m.id);
        const qty = Math.floor(Number(m.qty));
        if (!l) return err(s, 'That listing is gone (sold or cancelled).');
        if (l.seller === me.name) return err(s, 'You cannot buy your own listing.');
        if (!(qty >= 1 && qty <= l.qty)) return err(s, 'Invalid quantity.');
        const total = l.price * qty;
        l.qty -= qty;
        if (l.qty <= 0) market.listings.splice(market.listings.indexOf(l), 1);
        const hist = (market.history[l.itemId] ??= []);
        hist.push([now(), l.price]);
        if (hist.length > 200) hist.splice(0, hist.length - 200);
        send(s, { t: 'market.bought', inst: l.inst, qty, total, seller: l.seller });
        const seller = online(l.seller);
        const sale = { itemId: l.itemId, qty, total, buyer: me.name };
        if (seller) send(seller, { t: 'market.sold', ...sale }); else (market.payouts[l.seller] ??= []).push(sale);
        saveMarket();
        return;
      }
      case 'move': {
        const changedMap = me.mapId !== m.mapId;
        if (changedMap) {
          toMap(me.mapId, { t: 'playerLeave', name: me.name }, s);
          if (s.shop) { s.shop = null; me.vending = undefined; }
          if (s.trade) cancelTrade(s, 'Trade cancelled: a trader left the map.');
        }
        const title = typeof m.title === 'string' && m.title ? m.title.slice(0, 24) : undefined;
        Object.assign(me, { mapId: m.mapId, x: m.x, y: m.y, dir: m.dir, anim: m.anim, hpPct: m.hpPct, level: m.level, title });
        if (changedMap) { toMap(m.mapId, { t: 'player', info: me }, s); for (const o of sessions) if (o !== s && o.info?.mapId === m.mapId) send(s, { t: 'player', info: o.info }); }
        else toMap(m.mapId, { t: 'playerMove', name: me.name, mapId: m.mapId, x: m.x, y: m.y, dir: m.dir, anim: m.anim, hpPct: m.hpPct, level: m.level, title }, s);
        // Party windows only need map / level / HP changes, at most once a second.
        if (s.partyId && (changedMap || now() - s.lastPartyPush > 1000)) { s.lastPartyPush = now(); pushParty(s.partyId); }
        return;
      }
      case 'chat': {
        const text = String(m.text ?? '').slice(0, 200).trim();
        if (!text) return;
        const t = now();
        s.chatTimes = s.chatTimes.filter((x) => t - x < 5000);
        if (s.chatTimes.length >= 5) return err(s, 'You are sending messages too fast.');
        s.chatTimes.push(t);
        const msg: ServerMsg = { t: 'chat', channel: m.channel, from: me.name, text };
        if (m.channel === 'map') return toMap(me.mapId, msg);
        if (m.channel === 'global') return toAll(msg);
        if (m.channel === 'whisper') { const o = m.to && online(m.to); if (!o) return err(s, `${m.to} is not online.`); send(o, msg); return send(s, { ...msg, channel: `whisper→${o.info!.name}` }); }
        if (m.channel === 'party') { const p = s.partyId && parties.get(s.partyId); if (!p) return err(s, 'You are not in a party.'); for (const n of p.members) { const o = online(n); if (o) send(o, msg); } return; }
        if (m.channel === 'guild') { const g = guildOf(me.name); if (!g) return err(s, 'You are not in a guild.'); for (const n of g.members) { const o = online(n); if (o) send(o, msg); } return; }
        return;
      }
      // ------------------------------------------------------------ party
      case 'party.invite': {
        const o = online(m.name);
        if (!o || o === s) return err(s, `${m.name} is not online.`);
        if (o.partyId) return err(s, `${m.name} is already in a party.`);
        let pid = s.partyId;
        if (!pid) { pid = randomBytes(6).toString('hex'); parties.set(pid, { id: pid, leader: me.name, members: new Set([me.name]) }); s.partyId = pid; pushParty(pid); }
        const p = parties.get(pid)!;
        if (p.members.size >= 12) return err(s, 'The party is full (12).');
        o.partyInvite = pid;
        return send(o, { t: 'party.invite', from: me.name, partyId: pid });
      }
      case 'party.accept': {
        const p = parties.get(m.partyId);
        if (!p || s.partyInvite !== m.partyId) return err(s, 'That invitation is no longer valid.');
        if (s.partyId) leaveParty(s);
        p.members.add(me.name); s.partyId = p.id; s.partyInvite = null;
        return pushParty(p.id);
      }
      case 'party.leave': return leaveParty(s);
      case 'party.exp': {
        // The killer took its own share; send the others theirs. Even share: same map, within 15 levels of the killer.
        const p = s.partyId && parties.get(s.partyId);
        if (!p) return;
        const mates = [...p.members].map(online).filter((o): o is Session => !!o && o !== s && !!o.info && o.info.mapId === m.mapId && Math.abs(o.info.level - me.level) <= PARTY_LEVEL_GAP);
        const n = mates.length + 1;
        for (const o of mates) send(o, { t: 'party.exp', base: Math.floor(m.base / n), job: Math.floor(m.job / n), from: me.name });
        return;
      }
      // ------------------------------------------------------------ guild
      case 'guild.create': {
        const name = String(m.name ?? '').trim();
        if (!/^[A-Za-z0-9 ]{3,20}$/.test(name)) return err(s, 'Guild names are 3–20 letters, digits or spaces.');
        if (guildOf(me.name)) return err(s, 'Leave your guild first.');
        if (Object.values(guilds).some((g) => g.name.toLowerCase() === name.toLowerCase())) return err(s, 'That guild name is taken.');
        const g: Guild = { id: randomBytes(6).toString('hex'), name, master: me.name, members: [me.name], notice: '' };
        guilds[g.id] = g; save(); me.guild = g.name;
        toMap(me.mapId, { t: 'player', info: me }, s);
        return pushGuild(g);
      }
      case 'guild.invite': {
        const g = guildOf(me.name);
        if (!g || g.master !== me.name) return err(s, 'Only a guild master can invite.');
        const o = online(m.name);
        if (!o?.info) return err(s, `${m.name} is not online.`);
        if (guildOf(o.info.name)) return err(s, `${m.name} is already in a guild.`);
        if (g.members.length >= 30) return err(s, 'The guild is full (30).');
        o.guildInvite = g.id;
        return send(o, { t: 'guild.invite', from: me.name, guildId: g.id, name: g.name });
      }
      case 'guild.accept': {
        const g = guilds[m.guildId];
        if (!g || s.guildInvite !== m.guildId) return err(s, 'That invitation is no longer valid.');
        if (guildOf(me.name)) return err(s, 'Leave your guild first.');
        g.members.push(me.name); s.guildInvite = null; me.guild = g.name; save();
        toMap(me.mapId, { t: 'player', info: me }, s);
        return pushGuild(g);
      }
      case 'guild.leave': {
        const g = guildOf(me.name);
        if (!g) return err(s, 'You are not in a guild.');
        g.members = g.members.filter((x) => x !== me.name);
        me.guild = undefined;
        if (!g.members.length) { delete guilds[g.id]; if (castle.owner === g.id) castle.owner = null; } else if (g.master === me.name) g.master = g.members[0];
        save(); send(s, { t: 'guild.update', guild: null });
        toMap(me.mapId, { t: 'player', info: me }, s);
        return pushGuild(g);
      }
      // ------------------------------------------------------------ trade
      case 'trade.request': {
        const o = online(m.name);
        if (!o?.info || o === s) return err(s, `${m.name} is not online.`);
        if (!near(me, o.info, 200)) return err(s, 'Stand next to the player to trade.');
        if (s.trade || o.trade) return err(s, 'Someone is already trading.');
        o.tradeRequestFrom.add(me.name);
        return send(o, { t: 'trade.request', from: me.name });
      }
      case 'trade.accept': {
        const o = online(m.from);
        if (!o?.info || !s.tradeRequestFrom.has(m.from)) return err(s, 'That trade request expired.');
        s.tradeRequestFrom.delete(m.from);
        if (!near(me, o.info, 200)) return err(s, 'Too far away to trade.');
        if (s.trade || o.trade) return err(s, 'Someone is already trading.');
        const blank = (): TradeOffer => ({ items: [], luma: 0, locked: false, confirmed: false });
        s.trade = { with: o.info.name, offer: blank() }; o.trade = { with: me.name, offer: blank() };
        send(s, { t: 'trade.open', with: o.info.name }); send(o, { t: 'trade.open', with: me.name });
        return pushTrade(s, o);
      }
      case 'trade.offer': {
        if (!s.trade) return err(s, 'You are not trading.');
        if (s.trade.offer.locked) return err(s, 'Your offer is locked.');
        const o = online(s.trade.with);
        if (!o?.trade) return cancelTrade(s, 'Trade partner left.');
        if (m.items.length > 10) return err(s, 'Up to 10 items per trade.');
        s.trade.offer = { items: m.items.slice(0, 10), luma: Math.max(0, Math.floor(m.luma || 0)), locked: false, confirmed: false };
        o.trade.offer.confirmed = false;
        return pushTrade(s, o);
      }
      case 'trade.lock': case 'trade.confirm': {
        if (!s.trade) return err(s, 'You are not trading.');
        const o = online(s.trade.with);
        if (!o?.trade) return cancelTrade(s, 'Trade partner left.');
        if (m.t === 'trade.lock') s.trade.offer.locked = true;
        else { if (!s.trade.offer.locked || !o.trade.offer.locked) return err(s, 'Both sides must lock first.'); s.trade.offer.confirmed = true; }
        if (s.trade.offer.confirmed && o.trade.offer.confirmed) {
          const a = s.trade.offer, b = o.trade.offer;
          send(s, { t: 'trade.complete', give: a, receive: b }); send(o, { t: 'trade.complete', give: b, receive: a });
          s.trade = null; o.trade = null;
          return;
        }
        return pushTrade(s, o);
      }
      case 'trade.cancel': return cancelTrade(s, `${me.name} cancelled the trade.`);
      // ------------------------------------------------------------ vending
      case 'vend.open': {
        if (s.shop) return err(s, 'Close your shop first.');
        if (!m.listings.length || m.listings.length > 12) return err(s, 'A shop lists 1–12 items.');
        if (m.listings.some((l) => !(l.price > 0) || !(l.qty > 0))) return err(s, 'Every listing needs a price and quantity.');
        s.shop = { title: String(m.title || 'Shop').slice(0, 30), listings: m.listings };
        me.vending = s.shop.title;
        return toMap(me.mapId, { t: 'player', info: me });
      }
      case 'vend.close': { s.shop = null; me.vending = undefined; return toMap(me.mapId, { t: 'player', info: me }); }
      case 'vend.view': {
        const o = online(m.seller);
        if (!o?.shop || !o.info || !near(me, o.info, 300)) return err(s, 'That shop is closed or too far.');
        return send(s, { t: 'vend.list', seller: o.info.name, title: o.shop.title, listings: o.shop.listings });
      }
      case 'vend.buy': {
        const o = online(m.seller);
        if (!o?.shop || !o.info || !near(me, o.info, 300)) return err(s, 'That shop is closed or too far.');
        const l = o.shop.listings.find((x) => x.uid === m.uid);
        if (!l || !(m.qty > 0) || m.qty > l.qty) return err(s, 'Not enough of that item left.');
        return send(o, { t: 'vend.sale', buyer: me.name, uid: m.uid, qty: m.qty, price: l.price * m.qty });
      }
      case 'vend.saleResult': {
        // The seller confirms it really had the item and took it out of its bag.
        const buyer = online(m.buyer);
        if (!s.shop) return;
        const l = s.shop.listings.find((x) => x.uid === m.uid);
        if (!m.ok || !l || !m.inst) { if (buyer) err(buyer, 'The sale failed.'); return; }
        l.qty -= m.qty;
        if (l.qty <= 0) s.shop.listings = s.shop.listings.filter((x) => x !== l);
        if (buyer) send(buyer, { t: 'vend.bought', seller: me.name, inst: m.inst, qty: m.qty, price: m.price ?? l.price * m.qty });
        if (!s.shop.listings.length) { s.shop = null; me.vending = undefined; toMap(me.mapId, { t: 'player', info: me }); }
        else if (buyer) send(buyer, { t: 'vend.list', seller: me.name, title: s.shop.title, listings: s.shop.listings });
        return;
      }
      // ------------------------------------------------------------ PvP & guild war
      case 'pvp.hit': {
        const o = online(m.target);
        if (!o?.info) return;
        if (!PVP_MAPS.includes(me.mapId) || !near(me, o.info, 500)) return err(s, 'You can only fight players in a PvP area.');
        if (me.mapId === CASTLE_MAP) {
          if (!woeActive()) return err(s, 'The castle is peaceful outside the guild war.');
          if (me.guild && me.guild === o.info.guild) return;
        }
        return send(o, { t: 'pvp.damage', from: me.name, damage: Math.max(0, Math.min(99999, Math.floor(m.damage))), crit: !!m.crit });
      }
      case 'pvp.died': return toMap(me.mapId, { t: 'pvp.kill', killer: m.killer, victim: me.name });
      case 'woe.hit': {
        if (me.mapId !== CASTLE_MAP || !woeActive()) return err(s, 'The Emperium can only be attacked during the guild war.');
        const g = guildOf(me.name);
        if (!g) return err(s, 'Only guild members can attack the Emperium.');
        if (castle.owner === g.id) return err(s, 'Your guild already holds the castle.');
        if (Math.hypot(me.x - EMPERIUM_POS.x, me.y - EMPERIUM_POS.y) > 200) return err(s, 'Get closer to the Emperium.');
        emperiumHp = Math.max(0, emperiumHp - Math.max(0, Math.min(20000, Math.floor(m.damage))));
        if (emperiumHp === 0) {
          castle.owner = g.id; emperiumHp = emperiumMax; save();
          toAll({ t: 'chat', channel: 'global', from: 'Herald', text: `The guild ${g.name} has taken Castle Veyl!` });
        }
        return toAll({ t: 'woe.state', woe: woeState() });
      }
    }
  };

  // One HTTP server serves the built game (if staticDir is set), a /healthz probe for hosts, and the
  // WebSocket endpoint (HTTP upgrade on the same port), so a single URL works for players on the web.
  const files = opts.staticDir ? staticHandler(opts.staticDir) : null;
  const http = createServer((req, res) => {
    if (req.url?.split('?')[0] === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); return; }
    if (files) { void files(req, res); return; }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Veyloria server. Open the game in a browser, or connect with WebSocket.');
  });
  const wss = new WebSocketServer({ server: http });
  wss.on('connection', (ws) => {
    const s: Session = { ws, user: null, info: null, chatTimes: [], partyId: null, trade: null, tradeRequestFrom: new Set(), shop: null, partyInvite: null, guildInvite: null, lastPartyPush: 0 };
    sessions.add(s);
    ws.on('message', (raw) => {
      let m: ClientMsg;
      try { m = JSON.parse(String(raw)) as ClientMsg; } catch { return err(s, 'Bad message.'); }
      try { handle(s, m); } catch (e) { err(s, `Server error: ${(e as Error).message}`); }
    });
    ws.on('close', () => {
      if (s.trade) cancelTrade(s, 'Trade partner disconnected.');
      leaveParty(s);
      if (s.info) toMap(s.info.mapId, { t: 'playerLeave', name: s.info.name });
      sessions.delete(s);
      const g = s.info && guildOf(s.info.name);
      if (g) pushGuild(g);
    });
  });
  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(opts.port ?? 7171, opts.host, () => resolve({
      port: (http.address() as AddressInfo).port,
      state: { get woe() { return woeState(); } },
      close: () => new Promise<void>((r) => {
        for (const s of sessions) s.ws.terminate();
        wss.close();
        http.close(() => r());
        http.closeAllConnections();
      }),
    }));
  });
}
