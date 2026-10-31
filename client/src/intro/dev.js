// Stand-alone page for the intro: /intro-dev.html
//   ?d=45          total length in seconds (90 by default; 45 is the demo cut); plays in a loop
//   ?panel=3&k=0.5 freeze on one moment (panel 1..6, k 0..1) — for screenshots
//   ?q=low|high|ultra
//   Space — restart, S — skip (fade out)
import { world } from '../world/index.js';
import layout from '../../../content/ship_layout.json';
import { createIntro } from './index.js';

const P = new URLSearchParams(location.search);
const info = document.getElementById('info');
await world.init(document.getElementById('c'), P.get('q') ?? 'high', { auto: false });
world.loadLayout(layout);
document.getElementById('loading').remove();

const intro = createIntro(world);
window.intro = intro; window.world = world;
const RU = ['Книга Марко Поло', 'Шёлковый путь', 'Константинополь, 1453', 'Колумб над картой', 'Неизвестная земля', 'Палос, 3 августа 1492'];

if (P.has('head')) {
  // close-up of Columbus's head: ?head=<yaw in degrees>&lean=0..1
  const { columbus, scene } = intro.study, cam = intro.camera, yaw = (+P.get('head') || 0) * Math.PI / 180;
  const { poseLean } = await import('./columbus.js');
  poseLean(columbus, +(P.get('lean') ?? 0));
  columbus.root.visible = true;
  columbus.root.updateMatrixWorld(true);
  const c = columbus.face.getWorldPosition(new (await import('three')).Vector3());
  const dist = +(P.get('dist') ?? 0.42), aim = dist > 1 ? c.clone().setY(c.y - 0.5) : c;
  cam.position.set(aim.x + Math.sin(yaw) * dist, aim.y + 0.02, aim.z + Math.cos(yaw) * dist);
  cam.lookAt(aim);
  columbus.face.userData.lookAt(cam.position);
  info.textContent = `голова · yaw ${P.get('head')}° · ${dist} м`;
  const loop = () => { intro.study.update(1 / 60); world.renderer.toneMappingExposure = 0.95; world.renderer.render(scene, cam); requestAnimationFrame(loop); };
  loop();
} else if (P.has('panel')) {
  const i = Math.min(6, Math.max(1, +P.get('panel'))) - 1, k = +(P.get('k') ?? 0.5);
  info.textContent = `панель ${i + 1}: ${RU[i]} · k=${k}`;
  // a few frames so the candle, the sea and the shadow maps settle
  let n = 0;
  const loop = () => { intro.render(i, k, 1 / 60); if (++n < 400) requestAnimationFrame(loop); };
  loop();
} else {
  const d = +(P.get('d') ?? 90);
  intro.onPanel = (i) => { info.textContent = `панель ${i + 1}/6: ${RU[i]} · ${d} с`; };
  const run = async () => { await intro.play({ startAt: Date.now() + 300, duration: d }); setTimeout(run, 800); };
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') intro.stop(true).then(() => {});
    if (e.code === 'KeyS') intro.stop();
  });
  run();
}
