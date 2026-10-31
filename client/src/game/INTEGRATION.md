# Подключение к фронту 1

Фронт 1 создаёт world и canvas #game, фронт 2 работает с готовыми объектами.
main.js не создаёт сцену и не запускает requestAnimationFrame.

```js
import {attachWorld, gameEvents} from '../main.js';

const gameplay = attachWorld(world, document.querySelector('#game'));
// В существующем цикле кадров фронта 1, перед рендером:
gameplay.update(deltaSeconds, elapsedSeconds);
// При освобождении мира:
// gameplay.dispose();
```

Нужные методы world:

- camera: THREE.Camera, её position/rotation изменяет контроллер фронта 2;
- collide({position:Vector3,radius:0.35,height:1.7}): исправляет position на месте;
- groundHeight(x,z): высота ног;
- interactables: Object3D[] с userData {id,kind,label}.

kind: npc — диалог; item/pickup — pickup; остальные — interact.
Луч рекурсивный, расстояние 2,5 м, id ищется у ближайшего родителя.
Коллизии не вычисляются фронтом 2: для BVH/капсулы нужен адаптер фронта 1
к вышеописанному контракту. Движение блокируется до attachWorld.

Позиция контроллера — ноги, камера выше на 1,6 м. Координаты spawn/p идут без
пересчёта в move. Если команда хранит p как положение глаз, передать
attachWorld(world, canvas, {eyeHeight:0}) и адаптировать groundHeight/collide.
Сейчас серверный код не фиксирует этот смысл: проверить с высотой палубы фронта 1.

Опционально используются world.setZone, setTimeOfDay, setQuality,
players.upsert/snapshot/bubble и stats() → {drawCalls,worldText} для F3.
Удаление аватаров, entity, катсцены и чанки подключаются событиями:

```js
gameEvents.on('auth_ok', ({world:meta,state}) => { /* cacheLimit и сохранения */ });
gameEvents.on('chunk', message => { /* отдать менеджеру чанков */ });
gameEvents.on('chunk_denied', message => { /* отменить запрос */ });
gameEvents.on('entity', message => { /* обновить объект мира */ });
gameEvents.on('player_leave', ({id}) => { /* убрать аватар */ });
gameEvents.on('scene', message => { /* cutscene.play(id,startAt) */ });
gameEvents.on('voice', ({playing}) => { /* приглушить фон, когда playing */ });
```

Для отправки запросов чанков используется экспорт sendGameMessage(t,payload)
из main.js. Он возвращает false при отсутствии авторизованного соединения.
getPlayerState() возвращает {p,r,a} текущего игрока или null, пока мир не подключён.
Его p можно передавать менеджеру чанков. Фронт 2 не сохраняет chunk-данные
и не заводит второй кеш.

Уточнения бэка реализованы: auth_ok.scene, pos_correct {p,r}, код 4002 без
переподключения, 4001 требует нового входа. Роль выбирается через
interact {id:'role:piloto'}. Серверные chat имеют {from: id,name,text}.

Остаток части фронта 2: полный каталог заданий/предметов из content, торговля,
печатный текст диалога, таймлайн интро/субтитров, остальные мини-игры и «Бу!».
Новые модели и визуализация мира в этот список не входят.

## Уточнения фронта 1 и бэка 2

`r` используется как yaw камеры: 0 смотрит вдоль её -Z. Никаких дополнительных
инверсий/разворотов на π во фронте 2 нет. Нос корабля должен соответствовать
этой оси в модуле мира и его layout.

Если world.frame(dt) уже обновляет и рисует мир, вызов в общем цикле такой:

```js
gameplay.update(dt, elapsedSeconds);
world.frame(dt);
```

Единственный владелец ship-чанка должен передать его layout в мир:

```js
gameEvents.on('chunk', ({zone,key,data}) => {
  if (zone === 'ship' && key === '0,0') world.loadLayout(data.layout ?? data);
  // canary — в менеджер чанков фронта 1.
});
```

Не вызывать world.loadLayout дважды из разных обработчиков. Сами объекты,
спавны и места у фонаря создаются/описываются фронтом 1 и бэком 1.
Текстуры можно готовить по gameEvents.on('scene') в начале intro.

Аудио бэка 2 читается из /audio/vo/manifest.json и /audio/vo/<file>.mp3.
Экспорт playVoiceLine(id, {offset,rate}) запускает готовую реплику по ID.
content/intro.json, night_story.json и npcs.json подключаются опциональным
Vite glob: после слияния ветки ai они попадут в сборку без дублирования данных.
Для интро есть временные текстовые панели без JPG. Это интерфейс фронта 2;
HTML-панели позже можно дополнить изображениями из intro.json.
Субтитры разбиваются на короткие фрагменты, позиция выбирается по startAt.
При повторном входе озвучка продолжится с текущей реплики и смещения.
Сцены всё равно переключает сервер. Для синхронности между ноутбуками сейчас
предполагается согласованное системное время, отдельного clock-sync в протоколе нет.

События narrative_event {type:'sfx'|'fx',id,pos,dur} предназначены фронту 1.
Голоса не генерируются клиентом. Несовпавшие ID не переименовываются:
в текущем main есть sailor_4 в ship_layout, а в origin/ai npcs.json его нет.
Это нужно согласовать владельцам контента до объединения.
