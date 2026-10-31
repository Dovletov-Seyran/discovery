// Chunk manager (F1.5). Asks the server for chunks around the player, keeps at most `cacheLimit`
// of them (10% of the world, from auth_ok.world) and evicts the least recently seen invisible ones.
//
// Wiring (Фронт 2):
//   world.chunks.setSender((msg) => socket.send(msg))   — chunk_req / chunk_drop go out through it
//   world.chunks.setWorldMeta(authOk.world)               — { zones, totalChunks, totalBytes, cacheLimit }
//   on 'chunk':        world.chunks.receive(msg.zone, msg.key, msg.data)
//   on 'chunk_denied': world.chunks.denied(msg.zone, msg.key, msg.reason)
//   every frame:       world.chunks.update(playerPosition)
const CS = 32, LOAD_RADIUS = 2, EVERY = 0.5, RETRY = 3;

export class Chunks {
  constructor() {
    this.cache = new Map(); // `${zone}:${key}` → { zone, key, bytes, visible, seen }
    this.pending = new Map(); // `${zone}:${key}` → time requested
    this.meta = { zones: {}, totalChunks: 1, totalBytes: 0, cacheLimit: 25 };
    this.send = null;
    this.zone = null;
    this.builders = {}; // zone → { add(key, data), remove(key), setVisible(key, v) }
    this.timer = 0;
    this.lastPos = null;
  }

  setSender(fn) { this.send = fn; }
  setWorldMeta(meta) { if (meta) this.meta = { ...this.meta, ...meta }; }
  setBuilder(zone, builder) { this.builders[zone] = builder; }

  setZone(zone) {
    this.zone = zone;
    for (const c of this.cache.values()) this.show(c, false);
    this.timer = EVERY; // request right away on the next update
  }

  gridSize(zone) {
    const n = this.meta.zones?.[zone]?.chunks;
    return n ? Math.round(Math.sqrt(n)) : zone === 'ship' ? 1 : 16;
  }

  wanted(p) {
    if (this.zone === 'ship') return ['0,0'];
    const n = this.gridSize(this.zone), pcx = Math.floor(p.x / CS), pcz = Math.floor(p.z / CS), keys = [];
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (cx >= 0 && cz >= 0 && cx < n && cz < n) keys.push(`${cx},${cz}`);
    }
    // nearest first
    return keys.sort((a, b) => dist(a, pcx, pcz) - dist(b, pcx, pcz));
  }

  // p: { x, z } (a Vector3 is fine). While a cutscene sets `focus`, chunks load around its camera instead.
  update(p, dt = 1 / 60) {
    p = this.focus ?? p;
    this.timer += dt;
    if (!this.zone || this.timer < EVERY) return;
    this.timer = 0;
    this.lastPos = { x: p.x, z: p.z };
    const now = performance.now() / 1000, want = this.wanted(p), wantSet = new Set(want), ask = [];
    for (const key of want) {
      const id = `${this.zone}:${key}`, c = this.cache.get(id);
      if (c) { c.seen = now; this.show(c, true); continue; }
      const asked = this.pending.get(id);
      if (asked === undefined || now - asked > RETRY) { ask.push(key); this.pending.set(id, now); }
    }
    if (ask.length) this.send?.({ t: 'chunk_req', zone: this.zone, keys: ask.slice(0, 30) });
    // outside the load radius: hidden, but cached until the 10% limit pushes it out
    // (5×5 around the player is exactly 10% of 257 chunks, so there is no room for a wider ring)
    for (const c of this.cache.values()) if (c.zone === this.zone && !wantSet.has(c.key)) this.show(c, false);
    this.evict();
  }

  receive(zone, key, data) {
    const id = `${zone}:${key}`;
    this.pending.delete(id);
    const builder = this.builders[zone];
    if (!builder) return;
    builder.add(key, data);
    const c = { zone, key, bytes: JSON.stringify(data).length, visible: true, seen: performance.now() / 1000 };
    this.cache.set(id, c);
    if (zone !== this.zone) this.show(c, false);
    this.evict();
  }

  denied(zone, key, reason) {
    // too_far happens when the player outran the request; it is asked again on a later update
    if (reason !== 'too_far') console.warn('[world] chunk denied', zone, key, reason);
  }

  show(c, v) {
    if (c.visible === v) return;
    c.visible = v;
    this.builders[c.zone]?.setVisible(c.key, v);
  }

  evict() {
    const limit = Math.max(1, this.meta.cacheLimit);
    if (this.cache.size <= limit) return;
    const hidden = [...this.cache.values()].filter((c) => !c.visible).sort((a, b) => a.seen - b.seen);
    const drop = {};
    while (this.cache.size > limit && hidden.length) {
      const c = hidden.shift();
      this.builders[c.zone]?.remove(c.key);
      this.cache.delete(`${c.zone}:${c.key}`);
      (drop[c.zone] ??= []).push(c.key);
    }
    for (const [zone, keys] of Object.entries(drop)) this.send?.({ t: 'chunk_drop', zone, keys });
  }

  stats() {
    let bytes = 0;
    for (const c of this.cache.values()) bytes += c.bytes;
    const total = this.meta.totalChunks || 1;
    return { loaded: this.cache.size, total, bytes, totalBytes: this.meta.totalBytes, pct: (100 * this.cache.size) / total, limit: this.meta.cacheLimit };
  }
}

function dist(key, pcx, pcz) {
  const [cx, cz] = key.split(',').map(Number);
  return Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
}
