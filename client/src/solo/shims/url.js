// node:url для сервера в браузере. Плагин сборки подставляет вместо import.meta.url серверных модулей
// file:///__repo__/<путь в репозитории>, так что вычисленные сервером пути совпадают с ключами shims/fs.js.
export const fileURLToPath = (u) => decodeURIComponent((u instanceof URL ? u : new URL(u)).pathname);
export const pathToFileURL = (p) => new URL(`file://${p}`);
export const URL_ = globalThis.URL;
export { URL_ as URL };

export default { fileURLToPath, pathToFileURL, URL: globalThis.URL };
