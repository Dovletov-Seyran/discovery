// Архивы для itch.io: npm run release
//   release/discovery-1492-web.zip         — одиночная игра в браузере (itch: Kind of project → HTML)
//   release/discovery-1492-multiplayer.zip — сервер для игры по сети (скачиваемый файл)
// Нужны git и zip (macOS/Linux).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'release');
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const count = (dir) => readdirSync(dir).reduce((n, f) => n + (statSync(join(dir, f)).isDirectory() ? count(join(dir, f)) : 1), 0);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. Одиночная версия: index.html в корне архива, все пути относительные
run('npm', ['run', 'build:solo', '-w', 'client']);
const solo = join(ROOT, 'client/dist-solo');
const files = count(solo);
if (files > 900) throw new Error(`в веб-версии ${files} файлов — itch.io принимает до ~1000`);
run('zip', ['-qrX', join(OUT, 'discovery-1492-web.zip'), '.'], solo);

// 2. Сервер: файлы репозитория (без docs и dev-страниц) + собранный клиент + скрипты запуска
run('npm', ['run', 'build', '-w', 'client']);
const NAME = 'discovery-1492-multiplayer';
const stage = join(OUT, NAME);
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !/^(docs|release|scripts\/release|\.claude|\.github)\//.test(f) && existsSync(join(ROOT, f)));
for (const f of tracked) {
  mkdirSync(dirname(join(stage, f)), { recursive: true });
  cpSync(join(ROOT, f), join(stage, f));
}
cpSync(join(ROOT, 'client/dist'), join(stage, 'client/dist'), { recursive: true });
for (const f of ['start-server.command', 'start-server.bat', 'README-multiplayer.txt']) cpSync(join(ROOT, 'scripts/release', f), join(stage, f));
run('zip', ['-qrX', `${NAME}.zip`, NAME], OUT);
rmSync(stage, { recursive: true });

console.log(`\nГотово: release/discovery-1492-web.zip (${files} файлов) и release/${NAME}.zip`);
