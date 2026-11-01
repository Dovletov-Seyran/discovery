export class Events {
  listeners = new Map();
  on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return () => this.listeners.get(type)?.delete(fn); }
  emit(type, data) { this.listeners.get(type)?.forEach(fn => fn(data)); }
}
export class SocketClient extends Events {
  constructor({url, WebSocketImpl = globalThis.WebSocket} = {}) { super(); this.url = url; this.WebSocketImpl = WebSocketImpl; this.attempt = 0; this.stopped = true; this.authorized = false; }
  connect(token) { this.disconnect(); this.token = token; this.stopped = false; this.open(); }
  open() {
    if (this.stopped) return;
    const url = this.url || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    const ws = this.ws = new this.WebSocketImpl(url);
    this.emit('connection', {status:'connecting'});
    ws.onopen = () => { if (ws !== this.ws) return; ws.send(JSON.stringify({t:'auth',token:this.token})); };
    ws.onmessage = e => {
      if (ws !== this.ws) return;
      let message; try { message = JSON.parse(e.data); } catch { return; }
      if (!message || typeof message.t !== 'string') return;
      if (message.t === 'auth_ok') { this.authorized = true; this.attempt = 0; this.emit('connection',{status:'online'}); }
      if (message.t === 'auth_fail') { this.stopped = true; this.authorized = false; }
      this.emit(message.t,message);
    };
    ws.onclose = e => {
      if (ws !== this.ws) return;
      this.authorized = false;
      if (e.code === 4001) { this.stopped = true; this.emit('auth_fail',{reason:'session_expired'}); return; }
      if (e.code === 4002) { this.stopped = true; this.emit('connection',{status:'replaced'}); return; }
      if (e.code === 4003) { this.stopped = true; this.emit('connection',{status:'full'}); return; }
      if (e.code === 4004) { this.stopped = true; this.emit('connection',{status:'kicked'}); return; } // CLOSE.KICKED — отключил администратор
      if (this.stopped) return;
      this.emit('connection',{status:'reconnecting'});
      this.timer = setTimeout(() => this.open(), [1000,2000,5000][Math.min(this.attempt++,2)]);
    };
    ws.onerror = () => {}; // close drives reconnect; no second retry timer
  }
  send(t, payload = {}) { if (!this.authorized || this.ws?.readyState !== 1) return false; this.ws.send(JSON.stringify({...payload,t})); return true; }
  disconnect() { this.stopped = true; this.authorized = false; clearTimeout(this.timer); if (this.ws) { this.ws.onclose = null; this.ws.close(); } }
}


// Сообщения мира проходят из сокета через UI в WorldConnection.
export function forwardGameEvents(client, events) {
  for (const type of ['chunk','chunk_denied','entity','world_patch','world_event','player_equipment','player_action','scene_progress','scared','inventory','quest','npc_say','trade_state','combat','hit']) {
    client.on(type, message => events.emit(type, message));
  }
}
