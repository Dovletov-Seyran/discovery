import { routineState } from './npc-navigation.js';
// Общий маршрут для рендера и серверной проверки расстояния. Время — Unix, секунды.
// scene: id или {id,startAt}; startAt — серверное время начала сцены, миллисекунды.
export function npcScene(npc, scene = 'ship_day') {
  const id = typeof scene === 'string' ? scene : scene?.id;
  return { ...npc, ...npc.scenes?.[id] };
}
// paused: {scene: 'id@startAt', at: ms|null, offset: ms, lookAt: [x,y,z]|null}.
// at фиксирует часы маршрута; offset сохраняет время остановок после продолжения.
export function npcActivity(npc, seconds = Date.now() / 1000, scene = 'ship_day', paused = null, behavior = null) {
  const key = typeof scene === 'string' ? scene : `${scene.id}@${scene.startAt ?? 0}`;
  const playback = paused?.scene === key ? paused : null;
  if (playback) seconds = ((playback.at ?? seconds * 1000) - (playback.offset ?? 0)) / 1000;
  if (Number.isFinite(scene?.startAt)) seconds = Math.max(0, seconds - scene.startAt / 1000);
  const state = behavior?.scene === key ? routineState(behavior, seconds) : sampleActivity(npcScene(npc, scene), seconds);
  if (playback?.at != null) {
    const seated=['guitar','tune','sit','tell','listen','seated_toast'].includes(state.action);
    state.walking = false;
    state.action = playback.kind === 'obstacle' ? 'wait' : seated ? 'seated_talk' : 'talk';
    if (playback.lookAt) state.r = Math.atan2(state.p[0] - playback.lookAt[0], state.p[2] - playback.lookAt[2]);
  }
  return state;
}

function sampleActivity(npc, seconds) {
  const stops = npc.activity;
  if (!stops?.length) return { p: npc.p, r: npc.r ?? 0, action: npc.pose ?? 'stand', walking: false };
  const speed = 0.55;
  const durations = stops.map((stop, i) => {
    const next = stops[(i + 1) % stops.length];
    return { wait: stop.wait ?? 8, travel: Math.hypot(next.p[0] - stop.p[0], next.p[2] - stop.p[2]) / speed };
  });
  const period = durations.reduce((n, d) => n + d.wait + d.travel, 0);
  if (!period) return { p: stops[0].p, r: stops[0].r ?? 0, action: stops[0].action ?? 'stand', walking: false };
  let t = ((seconds % period) + period) % period;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i], next = stops[(i + 1) % stops.length], d = durations[i];
    const heading = Math.atan2(stop.p[0] - next.p[0], stop.p[2] - next.p[2]);
    if (t < d.wait) return { p: stop.p, r: stop.r ?? heading, action: stop.action ?? 'stand', walking: false };
    t -= d.wait;
    if (t < d.travel) {
      const f = t / d.travel;
      return { p: stop.p.map((v, j) => v + (next.p[j] - v) * f), r: heading, action: 'walk', walking: true };
    }
    t -= d.travel;
  }
  return { p: stops[0].p, r: stops[0].r ?? 0, action: stops[0].action ?? 'stand', walking: false };
}
