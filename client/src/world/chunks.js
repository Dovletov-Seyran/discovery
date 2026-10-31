// Chunk manager (F1.5). The ship zone is a single chunk; the island arrives with the Canaries.
export class Chunks {
  constructor() {
    this.loaded = new Map(); // key -> bytes
    this.total = 1; this.totalBytes = 0;
  }

  setWorldMeta({ totalChunks, totalBytes } = {}) {
    if (totalChunks) this.total = totalChunks;
    if (totalBytes) this.totalBytes = totalBytes;
  }

  markLoaded(zone, key, bytes) { this.loaded.set(`${zone}:${key}`, bytes); }

  update() {}

  stats() {
    const bytes = [...this.loaded.values()].reduce((a, b) => a + b, 0);
    return { loaded: this.loaded.size, total: this.total, bytes, totalBytes: this.totalBytes, pct: (100 * this.loaded.size) / this.total };
  }
}
