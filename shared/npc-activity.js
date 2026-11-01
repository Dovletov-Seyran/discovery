// Pure timeline shared by rendering and server interaction checks. Time is Unix seconds.
export function npcActivity(npc, seconds = Date.now() / 1000) {
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
