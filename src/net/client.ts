// Browser side of online play: a small WebSocket client for the Veyloria
// server. The App owns one; when it is connected and a character is in the
// world, presence, chat, party, guild, trade, vending, PvP and guild-war
// messages flow through here. Without a server the game stays single-player.
import type { ClientMsg, ServerMsg } from './protocol';

/** Where the game's server is, when the player doesn't type one: the page's own address when the game is
 *  served by the Veyloria server (so one URL works on the web), or localhost for `npm run dev` / a file:// page. */
export function defaultServerUrl(): string {
  if (import.meta.env.DEV || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return 'ws://localhost:7171';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

export type NetStatus = 'offline' | 'connecting' | 'connected' | 'authed';

export class NetClient {
  status: NetStatus = 'offline';
  user: string | null = null;
  lastError = '';
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: ServerMsg) => void>();

  onMessage(fn: (m: ServerMsg) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  connect(url: string): Promise<void> {
    this.disconnect();
    this.status = 'connecting';
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch (e) { this.status = 'offline'; this.lastError = String(e); reject(e); return; }
      this.ws = ws;
      ws.onopen = () => { this.status = 'connected'; resolve(); };
      ws.onerror = () => { this.lastError = `Could not reach ${url}`; if (this.status === 'connecting') { this.status = 'offline'; reject(new Error(this.lastError)); } };
      ws.onclose = () => { this.status = 'offline'; this.user = null; this.emit({ t: 'error', text: 'Disconnected from the server.' }); };
      ws.onmessage = (ev) => {
        let m: ServerMsg;
        try { m = JSON.parse(String(ev.data)) as ServerMsg; } catch { return; }
        if (m.t === 'welcome') { this.status = 'authed'; this.user = m.user; }
        if (m.t === 'error') this.lastError = m.text;
        this.emit(m);
      };
    });
  }

  disconnect() { if (this.ws) { this.ws.onclose = null; this.ws.close(); } this.ws = null; this.status = 'offline'; this.user = null; }
  send(m: ClientMsg) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  get online() { return this.status === 'authed'; }
  private emit(m: ServerMsg) { for (const fn of this.listeners) fn(m); }
}
