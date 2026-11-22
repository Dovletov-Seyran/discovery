ОТКРЫТИЕ 1492 — ИГРА ПО СЕТИ
============================

Один компьютер запускает сервер, остальные (до 3 игроков) открывают игру в Chrome
по адресу этого компьютера. Все должны быть в одной сети (Wi-Fi/LAN).

1. Установите Node.js 24 или новее: https://nodejs.org
2. Запустите сервер:
     macOS / Linux — двойной клик по start-server.command
                     (если macOS не даёт: правый клик → «Открыть»)
     Windows       — двойной клик по start-server.bat
   Первый запуск ставит зависимости из интернета (несколько минут), дальше — без интернета.
3. В окне сервера появится адрес вида https://192.168.1.23:3000 с пометкой
   «← открыть на других ноутбуках». Откройте его в Chrome на каждом компьютере.
4. Chrome предупредит о сертификате — это нормально для локальной сети:
   «Дополнительные» → «Перейти на сайт». (Чтобы убрать предупреждение навсегда,
   установите data/certs/ca.crt как доверенный — см. README.md, раздел HTTPS.)
5. Каждый игрок создаёт аккаунт (имя и пароль хранятся только на этом сервере),
   выбирает роль и нажимает «Готов».

Если другие компьютеры не открывают адрес — разрешите входящие подключения для node
в брандмауэре (macOS: Настройки → Сеть → Брандмауэр; Windows спросит сам при первом запуске).

Остановить сервер — закрыть окно или Ctrl+C. Сбросить прогресс — npm run reset (сервер остановлен).
NPC отвечают заготовленными фразами. Живые ответы локальной нейросети — для энтузиастов:
нужен Ollama (ollama pull qwen3:4b-instruct) и запуск с переменной AI=1.


DISCOVERY 1492 — LAN MULTIPLAYER
================================

One computer runs the server; other players (up to 3) open the game in Chrome
using that computer's address. Everyone must be on the same network.

1. Install Node.js 24+: https://nodejs.org
2. Start the server: macOS/Linux — double-click start-server.command
   (right-click → Open if macOS blocks it); Windows — double-click start-server.bat.
   The first run downloads dependencies (needs internet once).
3. The server window prints an address like https://192.168.1.23:3000 — open it in Chrome.
4. Chrome warns about the certificate (self-signed, local network): Advanced → Proceed.
5. Each player creates an account, picks a role and presses Ready.
The game text is in Russian.
