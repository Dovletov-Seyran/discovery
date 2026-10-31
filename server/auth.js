// Регистрация и вход: POST /api/register, POST /api/login → { token }.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getUserByLogin, createUser, createSession } from './db.js';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

const LOGIN_RE = /^[\p{L}\p{N}_-]{3,20}$/u;
const MIN_PASSWORD = 4;
const MAX_PASSWORD = 100;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, KEYLEN);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored).split(':');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

// Ответ: { status, body }. Ошибки — { error: код, message: текст по-русски }.
const fail = (status, error, message) => ({ status, body: { error, message } });

function readCredentials(body) {
  const login = typeof body?.login === 'string' ? body.login.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  return { login, password };
}

export async function register(body) {
  const { login, password } = readCredentials(body);
  if (!LOGIN_RE.test(login)) {
    return fail(400, 'bad_login', 'Имя: от 3 до 20 символов — буквы, цифры, «_» или «-»');
  }
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return fail(400, 'bad_password', `Пароль: не короче ${MIN_PASSWORD} символов`);
  }
  if (getUserByLogin(login)) return fail(409, 'login_taken', 'Это имя уже занято');

  let userId;
  try {
    userId = createUser(login, await hashPassword(password));
  } catch {
    return fail(409, 'login_taken', 'Это имя уже занято'); // гонка двух регистраций
  }
  return { status: 200, body: { token: createSession(userId) } };
}

export async function login(body) {
  const { login, password } = readCredentials(body);
  const user = login && password ? getUserByLogin(login) : null;
  if (!user || !(await verifyPassword(password, user.pass_hash))) {
    return fail(401, 'bad_credentials', 'Неверное имя или пароль');
  }
  return { status: 200, body: { token: createSession(user.id) } };
}
