// Мелочи для вкладок админки: экранирование, числа, мини-графики.

export const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const ROLE_NAMES = { grumete: 'Юнга', piloto: 'Штурман', lengua: 'Переводчик' };

export function fmt(v, digits = 0, unit = '') {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}${unit}`;
}

export function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} с` : s < 3600 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин`;
}

// Мини-график последних значений (null — пропуск). max — верх шкалы, иначе по данным.
export function spark(values, { max, width = 120, height = 28, cls = '' } = {}) {
  const list = values.map((v) => (Number.isFinite(v) ? v : null));
  const known = list.filter((v) => v !== null);
  if (known.length < 2) return `<svg class="spark ${cls}" width="${width}" height="${height}" aria-hidden="true"></svg>`;
  const top = max ?? Math.max(...known, 1), step = width / Math.max(list.length - 1, 1);
  let d = '', pen = false;
  list.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    const x = (i * step).toFixed(1), y = (height - 2 - (Math.min(v, top) / top) * (height - 4)).toFixed(1);
    d += `${pen ? 'L' : 'M'}${x} ${y}`;
    pen = true;
  });
  return `<svg class="spark ${cls}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}"/></svg>`;
}

// Значение с оттенком: ok / warn / bad
export const level = (v, warn, bad, higherIsBetter = false) => {
  if (v == null || !Number.isFinite(v)) return '';
  return higherIsBetter ? (v < bad ? 'bad' : v < warn ? 'warn' : 'ok') : (v > bad ? 'bad' : v > warn ? 'warn' : 'ok');
};
