// npm run cert — создать (или проверить) центр сертификации и сертификат сервера для HTTPS.
// Можно запускать при работающем сервере: он подхватит новый сертификат при следующем старте.
import { loadTls, serverNames, CERT_DIR } from '../tls.js';

const tls = await loadTls();
const { ips, dns } = serverNames();
if (!tls.created.ca && !tls.created.cert) console.log('[tls] сертификаты в порядке, ничего не меняли');
console.log(`
Папка:        ${CERT_DIR}
Адреса:       ${[...dns, ...ips].join(', ')}
Отпечаток CA: ${tls.fingerprint}

Дальше:
  1. На этом компьютере и на каждом ноутбуке установить ca.crt как доверенный корневой сертификат
     (файл: data/certs/ca.crt или https://<IP сервера>:3000/ca.crt) — см. README, раздел HTTPS.
  2. Запустить сервер с HTTPS: npm run start:demo (или npm run dev:https для разработки).
`);
