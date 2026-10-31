// Offline stand-in for the chunk part of the server, so /world-dev.html works without it.
// The island comes from the server's own generator (server/world/terrain.js, Бэк 1) — no copy to keep in sync;
// the real chunks always come from the server.
import { generateCanary as generateIsland } from '../../../../server/world/terrain.js';
import canaryLayout from '../../../../content/canary_layout.json';
import shipLayout from '../../../../content/ship_layout.json';

const CS = 32, SERVER_RADIUS = 3;

function generateCanary(layout) {
  const { chunks, heightAt } = generateIsland(layout, { warn: () => {} });
  return { chunks, heightAt };
}

// getPlayer() → { zone, p: [x, y, z] }, deliver(msg) → the client's handler for server messages
export function createFakeServer(getPlayer, deliver) {
  const { chunks: canary, heightAt } = generateCanary(canaryLayout);
  const { _comment, ...ship } = shipLayout;
  const store = { 'ship:0,0': { ...ship, zone: 'ship', cx: 0, cz: 0, size: CS, res: 0, h: null } };
  for (const [k, c] of canary) store[`canary:${k}`] = c;
  let totalBytes = 0;
  for (const c of Object.values(store)) totalBytes += JSON.stringify(c).length;
  const totalChunks = Object.keys(store).length;
  const meta = { zones: { ship: { chunks: 1 }, canary: { chunks: canary.size } }, totalChunks, totalBytes, cacheLimit: Math.floor(0.1 * totalChunks) };

  function handle(msg) {
    if (msg.t !== 'chunk_req') return;
    const pl = getPlayer(), pcx = Math.floor(pl.p[0] / CS), pcz = Math.floor(pl.p[2] / CS);
    for (const key of msg.keys) {
      const [cx, cz] = key.split(',').map(Number), data = store[`${msg.zone}:${key}`];
      let reply;
      if (msg.zone !== pl.zone) reply = { t: 'chunk_denied', zone: msg.zone, key, reason: 'wrong_zone' };
      else if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > SERVER_RADIUS) reply = { t: 'chunk_denied', zone: msg.zone, key, reason: 'too_far' };
      else if (!data) reply = { t: 'chunk_denied', zone: msg.zone, key, reason: 'not_found' };
      else reply = { t: 'chunk', zone: msg.zone, key, data: structuredClone(data) };
      setTimeout(() => deliver(reply), 15 + Math.random() * 25);
    }
  }
  return { meta, handle, heightAt };
}
