// node:crypto для сервера в браузере. Сервер берёт оттуда id предметов (randomUUID), токены (randomBytes)
// и отпечаток раскладок мира (createHash('sha1') — только чтобы заметить, что мир надо перегенерировать).
const webCrypto = globalThis.crypto;

export const randomUUID = () => webCrypto.randomUUID();

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export function randomBytes(n) {
  const bytes = webCrypto.getRandomValues(new Uint8Array(n));
  return { length: n, toString: (enc = 'hex') => (enc === 'base64url' ? base64url(bytes) : hex(bytes)) };
}

// Не криптографический: два 32-битных FNV-1a по всему тексту. Для сравнения «раскладка та же или нет» хватает
export function createHash() {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  const api = {
    update(data) {
      const s = String(data);
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193) >>> 0;
        b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
      }
      return api;
    },
    digest: () => a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0'),
  };
  return api;
}

// randomInt(max) или randomInt(min, max): целое в [min, max)
export function randomInt(min, max) {
  if (max === undefined) { max = min; min = 0; }
  const range = max - min;
  return min + (webCrypto.getRandomValues(new Uint32Array(1))[0] % range);
}
export const timingSafeEqual = (a, b) => a.length === b.length && [...a].every((x, i) => x === b[i]);

export default { randomUUID, randomBytes, randomInt, createHash, timingSafeEqual };
