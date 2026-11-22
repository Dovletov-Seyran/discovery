// node:fs для сервера в браузере (одиночная сборка): только чтение встроенного контента.
// Файлы — content/**/*.json и манифест озвучки, их кладёт в сборку плагин vite.solo.config.js
// (virtual:solo-files, ключи вида /content/quests.json). Запись — молча ничего: сохранения идут через shims/db.js.
import files from 'virtual:solo-files';

// file:///__repo__/content/x.json, /__repo__/content/x.json → /content/x.json
const key = (p) => String(p instanceof URL ? p.pathname : p).replace(/^file:\/\//, '').replace(/^\/__repo__/, '').replace(/\/{2,}/g, '/');
const dirKey = (p) => key(p).replace(/\/?$/, '/');
const missing = (p) => Object.assign(new Error(`ENOENT: no such file, '${key(p)}'`), { code: 'ENOENT' });

export function readFileSync(p) {
  const k = key(p);
  if (!Object.hasOwn(files, k)) throw missing(p);
  return files[k];
}
export const existsSync = (p) => Object.hasOwn(files, key(p)) || Object.keys(files).some((f) => f.startsWith(dirKey(p)));
export function readdirSync(p) {
  const dir = dirKey(p);
  return [...new Set(Object.keys(files).filter((f) => f.startsWith(dir)).map((f) => f.slice(dir.length).split('/')[0]))];
}
export function statSync(p) {
  if (!existsSync(p)) throw missing(p);
  return { mtimeMs: 0, size: Object.hasOwn(files, key(p)) ? files[key(p)].length : 0, isFile: () => Object.hasOwn(files, key(p)), isDirectory: () => !Object.hasOwn(files, key(p)) };
}
export const writeFileSync = () => {};
export const appendFileSync = () => {};
export const mkdirSync = () => {};
export const unlinkSync = () => {};
export const renameSync = () => {};
export const rmSync = () => {};
export const copyFileSync = () => {};
export const cpSync = () => {};
export const mkdtempSync = (prefix) => `${prefix}solo`;
export function createReadStream() { throw new Error('createReadStream недоступен в браузере'); }

export default { readFileSync, existsSync, readdirSync, statSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync, renameSync, rmSync, copyFileSync, cpSync, mkdtempSync, createReadStream };
