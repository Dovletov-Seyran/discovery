// node:path (posix) для сервера в браузере: хватает того, чем сервер склеивает пути к контенту.
export const sep = '/';

export function normalize(p) {
  const abs = p.startsWith('/'), out = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (out.length && out.at(-1) !== '..') out.pop(); else if (!abs) out.push('..'); } else out.push(part);
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.');
}
export const join = (...parts) => normalize(parts.filter(Boolean).join('/'));
export function resolve(...parts) {
  let p = '';
  for (const part of parts) { if (!part) continue; p = part.startsWith('/') ? part : `${p}/${part}`; }
  return normalize(p.startsWith('/') ? p : `/${p}`);
}
export const dirname = (p) => { const n = normalize(p), i = n.lastIndexOf('/'); return i <= 0 ? (n.startsWith('/') ? '/' : '.') : n.slice(0, i); };
export const basename = (p, ext = '') => { const b = normalize(p).split('/').pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; };
export const extname = (p) => { const b = basename(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
export function relative(from, to) {
  const a = resolve(from).split('/').filter(Boolean), b = resolve(to).split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}
export const isAbsolute = (p) => p.startsWith('/');

export default { sep, normalize, join, resolve, dirname, basename, extname, relative, isAbsolute };
