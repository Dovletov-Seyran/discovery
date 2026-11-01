// HTTPS в локальной сети без интернета и без домена.
// Публичные центры сертификации (Let's Encrypt) тут не работают, поэтому у нас свой маленький:
//   data/certs/ca.crt, ca.key     — «1492 LAN CA», создаётся один раз на 10 лет; ca.crt ставят на ноутбуки
//   data/certs/cert.pem, key.pem  — сертификат сервера на localhost и все IP этого компьютера, подписан CA
// Сертификат сервера перевыпускается сам, если IP сменился или срок подходит к концу; CA при этом прежний,
// поэтому на ноутбуках ничего переустанавливать не нужно. Ключи — только в data/ (не в git).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import { X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

export const CERT_DIR = fileURLToPath(new URL('../data/certs/', import.meta.url));
const FILES = { caKey: 'ca.key', caCrt: 'ca.crt', key: 'key.pem', cert: 'cert.pem' };
const path = (name) => CERT_DIR + FILES[name];
const read = (name) => readFileSync(path(name), 'utf8');
const DAY = 24 * 3600 * 1000;

// Все адреса, по которым к серверу могут прийти: localhost, имя компьютера, каждый IPv4 сетевых адаптеров
export function serverNames() {
  const ips = ['127.0.0.1'];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }
  const host = hostname().toLowerCase();
  const dns = ['localhost', host, host.endsWith('.local') ? host : `${host}.local`];
  return { ips: [...new Set(ips)], dns: [...new Set(dns)] };
}

async function makeCa() {
  const now = new Date(), until = new Date(now.getTime() + 3650 * DAY);
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: '1492 LAN CA' }, { name: 'organizationName', value: '1492 — school project' }],
    {
      keyType: 'rsa', keySize: 2048, algorithm: 'sha256', notBeforeDate: now, notAfterDate: until,
      extensions: [
        { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true, critical: true },
      ],
    },
  );
  writeFileSync(path('caKey'), pems.private, { mode: 0o600 });
  writeFileSync(path('caCrt'), pems.cert);
}

// 800 дней: macOS не доверяет сертификатам серверов дольше 825 дней даже от своего CA
async function makeServerCert({ ips, dns }) {
  const now = new Date(), until = new Date(now.getTime() + 800 * DAY);
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: ips.find((ip) => ip !== '127.0.0.1') ?? 'localhost' }],
    {
      keyType: 'rsa', keySize: 2048, algorithm: 'sha256', notBeforeDate: now, notAfterDate: until,
      ca: { key: read('caKey'), cert: read('caCrt') },
      extensions: [
        { name: 'basicConstraints', cA: false, critical: true },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [...dns.map((value) => ({ type: 2, value })), ...ips.map((ip) => ({ type: 7, ip }))] },
      ],
    },
  );
  writeFileSync(path('key'), pems.private, { mode: 0o600 });
  writeFileSync(path('cert'), pems.cert);
}

// Почему текущий сертификат сервера не годится, или null
function staleReason(names) {
  if (!existsSync(path('cert')) || !existsSync(path('key'))) return 'нет сертификата';
  const cert = new X509Certificate(read('cert')), ca = new X509Certificate(read('caCrt'));
  if (!cert.checkIssued(ca) || !cert.verify(ca.publicKey)) return 'подписан другим CA';
  if (new Date(cert.validTo).getTime() - Date.now() < 30 * DAY) return 'срок подходит к концу';
  const san = cert.subjectAltName ?? '';
  const missing = names.ips.filter((ip) => !san.includes(`IP Address:${ip}`));
  return missing.length ? `новый адрес ${missing.join(', ')}` : null;
}

// → { key, cert, caFile, fingerprint, created: { ca, cert } }
export async function loadTls({ log = console.log } = {}) {
  mkdirSync(CERT_DIR, { recursive: true });
  const created = { ca: false, cert: false };
  if (!existsSync(path('caCrt')) || !existsSync(path('caKey'))) {
    await makeCa();
    created.ca = true;
    log('[tls] создан центр сертификации «1492 LAN CA»: data/certs/ca.crt — установите его на ноутбуки (README, раздел HTTPS)');
  }
  const names = serverNames(), reason = staleReason(names);
  if (reason) {
    await makeServerCert(names);
    created.cert = true;
    log(`[tls] выпущен сертификат сервера (${reason}): ${[...names.dns, ...names.ips].join(', ')}`);
  }
  const ca = new X509Certificate(read('caCrt'));
  return { key: read('key'), cert: read('cert'), caFile: path('caCrt'), fingerprint: ca.fingerprint256, created };
}
