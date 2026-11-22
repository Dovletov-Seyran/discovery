// Плагин одиночной сборки (vite.solo.config.js): серверный код (server/) собирается в страницу.
// - node:fs/path/url/crypto/… и пакет ws → заглушки из src/solo/shims;
// - server/db.js (SQLite) → src/solo/shims/db.js (память + localStorage);
// - import.meta.url серверных модулей → file:///__repo__/<путь>, чтобы пути к content/ совпали с fs-заглушкой;
// - virtual:solo-files — содержимое content/**/*.json и манифеста озвучки строками.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const SHIMS = fileURLToPath(new URL('./shims/', import.meta.url));
const SERVER = join(REPO, 'server') + sep;
const DB = join(REPO, 'server', 'db.js');
const VIRTUAL = 'virtual:solo-files';

const NODE = {
  fs: 'fs.js', path: 'path.js', url: 'url.js', crypto: 'crypto.js',
  perf_hooks: 'node-misc.js', worker_threads: 'node-misc.js',
};

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export default function soloServer() {
  return {
    name: 'solo-server',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source === VIRTUAL) return '\0' + VIRTUAL;
      if (!importer?.startsWith(REPO) || importer.startsWith(SHIMS)) return null;
      const fromServer = importer.startsWith(SERVER);
      const bare = source.replace(/^node:/, '');
      if (fromServer && source === 'ws') return join(SHIMS, 'node-misc.js');
      if (fromServer && Object.hasOwn(NODE, bare)) return join(SHIMS, NODE[bare]);
      if (fromServer && source.startsWith('node:')) this.error(`одиночная сборка: ${relative(REPO, importer)} тянет ${source} — нужна заглушка`);
      if (source.endsWith('db.js')) {
        const r = await this.resolve(source, importer, { skipSelf: true });
        if (r?.id === DB) return join(SHIMS, 'db.js');
      }
      return null;
    },
    load(id) {
      if (id !== '\0' + VIRTUAL) return null;
      const files = {};
      for (const f of walk(join(REPO, 'content')).filter((f) => f.endsWith('.json'))) files['/' + relative(REPO, f).split(sep).join('/')] = readFileSync(f, 'utf8');
      files['/client/public/audio/vo/manifest.json'] = readFileSync(join(REPO, 'client/public/audio/vo/manifest.json'), 'utf8');
      return `export default ${JSON.stringify(files)};`;
    },
    transform(code, id) {
      if (!id.startsWith(SERVER)) return null;
      const rel = relative(REPO, id).split(sep).join('/');
      let out = code.replaceAll('import.meta.url', JSON.stringify(`file:///__repo__/${rel}`)).replaceAll('.unref()', '.unref?.()');
      if (rel === 'server/game/ai-bridge.js') {
        out = out.replace('!existsSync(AI_MODULE)', 'false').replace('await import(AI_MODULE.href)', "await import('../ai/index.js')");
      }
      return { code: out, map: null };
    },
  };
}
