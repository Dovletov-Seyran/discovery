// Pure timeline shared by rendering and server interaction checks. Time is Unix seconds.
//
// pause (from the server, entity state `paused`) — the NPC stops while a player talks to him:
//   { at, offset, face }  at — the second he stopped (null — walking on), offset — seconds he has stood
//   in total, so after the talk the route goes on from where he stopped; face — [x, z] of the speaker.
// While stopped the time is frozen at `at`, so every client shows the same spot without a clock sync.
export function npcActivity(npc, seconds = Date.now() / 1000, pause = null) {
  const state = route(npc, (pause?.at ?? seconds) - (pause?.offset ?? 0));
  if (pause?.at == null) return state;
  const r = pause.face ? Math.atan2(state.p[0] - pause.face[0], state.p[2] - pause.face[1]) : state.r;
  return { p: state.p, r, action: 'talk', walking: false };
}

function route(npc, seconds) {
  const stops = npc.activity;
  if (!stops?.length) return { p: npc.p, r: npc.r ?? 0, action: npc.pose ?? 'stand', walking: false };
  const speed = 0.55;
  const durations = stops.map((stop, i) => {
    const next = stops[(i + 1) % stops.length];
    return { wait: stop.wait ?? 8, travel: Math.hypot(next.p[0] - stop.p[0], next.p[2] - stop.p[2]) / speed };
  });
  const period = durations.reduce((n, d) => n + d.wait + d.travel, 0);
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
