// Запросы к /api/admin/* с токеном. Токен живёт в sessionStorage вкладки — закрыли вкладку, вход заново.
const KEY = 'discovery.admin';

let token = '';
try { token = sessionStorage.getItem(KEY) ?? ''; } catch { /* приватный режим: просто без запоминания */ }

export const hasToken = () => !!token;

export function setToken(value) {
  token = value;
  try { value ? sessionStorage.setItem(KEY, value) : sessionStorage.removeItem(KEY); } catch { /* см. выше */ }
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Ошибка ${status}`);
    this.status = status;
    this.body = body;
  }
}

// body: объект → JSON; строка (text: true) — как есть, так уходит текст файла контента
export async function api(method, path, body, { text = false } = {}) {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : text ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
