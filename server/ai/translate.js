import { chat } from './llm.js';

// Словарь терминов эпохи: маленькая модель иначе пишет «Ципангу», «пилот», «Боже знает»
const GLOSSARY = [
  '"boy" as a way to address the ship boy → юнга; "son" → сын (never юнга)',
  'Santa Maria → «Санта-Мария»; Pinta → «Пинта»; Nina → «Нинья»',
  'Silence! → Тише!; God speed → С Богом',
  'lad → парень',
  'pilot → штурман',
  'interpreter → переводчик',
  'Admiral → адмирал; Columbus → Колумб; the Genoese → генуэзец',
  'Admiral of the Ocean Sea → адмирал Моря-Океана',
  'Cipangu → Сипанго',
  'Cathay → Катай',
  'the Indies → Индия',
  'the Great Khan → Великий хан',
  'leagues → лиг',
  'maravedis → мараведи',
  'senor → сеньор',
  'my friend → друг мой',
  'goat cheese → козий сыр',
  'a wheel (of cheese) → головка сыра',
  'salted meat → солонина',
  "ship's biscuit → сухари",
  'God knows → одному Богу известно',
  'As I told you → Как я уже говорил',
  "I'll tell you what → Вот что я тебе скажу",
  'Listen here → Слушай-ка',
  'the Sea of Darkness → Море Мрака',
  'San Borondon → Сан-Борондон; El Hierro → Иерро; La Gomera → Ла-Гомера',
  'Moors → мавры',
  'the monarchs → король и королева',
  'plank → доска',
  'chest (a box) → сундук; astrolabe → астролябия; stern → корма',
  'boatswain → боцман; cook → кок; crew → команда; deck → палуба; below deck → в трюме',
  'fire box → очаг; barrels → бочки; rationed → выдают понемногу; wineskin → бурдюк',
  'galley (the ship kitchen) → камбуз; galley fire → огонь в камбузе',
  'sand glass, hourglass → песочные часы; turn the sand glass → переверни песочные часы; the sand runs out → песок пересыплется',
  'sing the prayer → спой молитву; watch (duty on a ship) → вахта; rest → отдыхай',
  'pay, wages → жалованье; the Crown → корона; heading, course → курс; latitude → широта; sea chart → морская карта',
  'beans → бобы; salted sardines → солёные сардины (not солонина); fresh water → пресная вода; well (for water) → колодец; shipyard → верфь; rudder → руль',
  'light the lanterns → зажгите фонари; raise the flag → поднимите флаг; furl the sails → уберите паруса',
  'Taíno words: cacique → касик; areíto → ареито; batey → батей; bohío → бохио; caney → каней; duho → дуо; casabe, cassava → касабе; manioc → маниок; burén → бурен; zemi → земи; huracán → ураган; hammock → гамак; canoe → каноэ',
  'child → дитя; son → сын; daughter → дочь; gourd → тыква; Yaya → Яйя; conch → раковина-лямби; spear → острога; maracas → маракасы',
];

// Примеры: маленькая модель лучше держит «ты» и морские слова, когда видит образец
const EXAMPLES = [
  ['Turn the sand glass at the stern each time the sand runs out, and sing the prayer.', 'Каждый раз, когда песок пересыплется, переворачивай песочные часы на корме и пой молитву.'],
  ['Go to the cook at the fire box. Rest when your watch ends; the boatswain will call you.', 'Иди к коку, к очагу. Отдыхай, когда кончится вахта, — боцман тебя позовёт.'],
  ['You are Seyran from Cordoba. You said you fear the sea; I told you about the Indies.', 'Ты Сейран из Кордовы. Ты говорил, что боишься моря, а я рассказал тебе об Индии.'],
  ['Yes, child. You took the spear and brought the catch to the cacique.', 'Да, дитя. Ты взял острогу и принёс улов касику.'],
];

const SYSTEM = [
  "Translate the user's text from English into natural, fluent Russian.",
  'It is the speech of a character in 1492; use a slightly old-fashioned, lively tone.',
  'Keep the exact meaning, use only real Russian words and correct grammar. Translate idioms by meaning, not word by word.',
  'Preserve the speaker and point of view: I/my/me stay я/мой/мне, never turn them into a third-person narrator.',
  'Foreign words and names you do not recognise (book titles, odd words) — leave exactly as written, do not translate them.',
  'The speaker talks to ONE person informally: always «ты», never «вы»; imperatives in the singular (иди, возьми, переверни).',
  'Keep who is who: «I/me» is the speaker (я), «you» is the player (ты). Never swap them.',
  'Translate every English word into Russian; never leave English words or half-English words in the translation.',
  'Use these terms:',
  ...GLOSSARY.map((g) => `- ${g}`),
].join('\n');

// names — [{ en, ru }]: люди экипажа и имена игроков (латиница в ответе → как их пишут по-русски)
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export async function toRussian(en, { names = [] } = {}) {
  // Чужие слова (One Piece) прячем под метку, чтобы модель их не «перевела», и возвращаем после
  const keep = names.filter((n) => n.en === n.ru && n.en.length > 1 && en.includes(n.en));
  keep.forEach((n, i) => { en = en.split(n.en).join(`QX${i}`); });
  const src = plain(en);
  const used = names.filter((n) => n.en !== n.ru && n.en && src.includes(plain(n.en.split(' ')[0])));
  const system = [
    SYSTEM,
    ...(used.length ? ['Names (write them exactly like this):', ...used.map((n) => `- ${n.en} → ${n.ru}`)] : []),
    'Output only the translation, nothing else.',
  ].join('\n');
  const res = await chat(
    [
      { role: 'system', content: keep.length ? `${system}\nTokens like QX0, QX1 are names: copy them unchanged.` : system },
      ...EXAMPLES.flatMap(([from, to]) => [{ role: 'user', content: from }, { role: 'assistant', content: to }]),
      { role: 'user', content: en },
    ],
    { priority: 0, temperature: 0.1, maxTokens: 320 },
  );
  let text = res.text.replace(/^["«]+|["»]+$/g, '').trim();
  keep.forEach((n, i) => { text = text.split(`QX${i}`).join(n.en); });
  return { text, ms: res.ms };
}
