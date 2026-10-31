// Диалог с агентом из терминала, без игры.
// npm run agent-cli -- columbus [--user test] [--role lengua] [--no-tts]
// Команды: /log <код> — добавить действие игрока, /hint <id>, /reset — забыть игрока, /quit
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { AI } from './config.js';
import { talk, init } from './index.js';
import { resetMemory } from './memory.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    user: { type: 'string', default: 'test' },
    role: { type: 'string', default: 'lengua' },
    name: { type: 'string', default: 'Luis' },
    'no-tts': { type: 'boolean', default: false },
  },
});
if (values['no-tts']) AI.TTS_ENABLED = false;

const npc = positionals[0] || 'columbus';
const context = { name: values.name, role: values.role, log: [] };
const gray = (s) => `\x1b[90m${s}\x1b[0m`;

console.log(gray(`model ${AI.MODEL}, tts ${AI.TTS_ENABLED ? 'on' : 'off'} — загрузка…`));
await init();

const rl = createInterface({ input: process.stdin, output: process.stdout });
await show(await talk({ userId: values.user, npc, context }));

while (true) {
  const line = (await rl.question('\n> ')).trim();
  if (!line) continue;
  if (line === '/quit') break;
  if (line === '/reset') {
    resetMemory(values.user, npc);
    console.log(gray('память очищена'));
    continue;
  }
  if (line.startsWith('/log ')) {
    context.log.push(line.slice(5).trim());
    console.log(gray(`журнал: ${context.log.join(', ')}`));
    continue;
  }
  const hintId = line.startsWith('/hint ') ? line.slice(6).trim() : undefined;
  await show(await talk({ userId: values.user, npc, text: hintId ? '' : line, hintId, context }));
}
rl.close();
process.exit(0);

async function show(r) {
  console.log(`\n${npc}: ${r.en}`);
  console.log(`   ${r.ru}`);
  if (r.audio) console.log(gray(`   audio ${r.audio}`));
  const t = r.timings;
  console.log(gray(`   cards [${t.cards?.join(', ') ?? ''}] new [${r.topicsTold.join(', ')}] · llm ${t.llm ?? 0} ms · ru ${t.translate ?? 0} ms · tts ${t.tts ?? 0} ms · всего ${t.total} ms`));
  console.log(gray(`   подсказки: ${r.hints.map((h) => `${h.id} «${h.ru}»`).join(' · ')}`));
}
