// Benchmark for the team laptops: /world-dev.html?bench
// Runs every preset by day and by night from two views, ~4 s each, and prints a table to copy into the chat.
// Run it with the browser window maximised: the result depends on the number of pixels.

const VIEWS = {
  quarterdeck: [0.95, 3.6, 9.7, 0.07, 0.07],
  main_deck: [-1.5, 1.62, 3.6, 0.12, 0.12],
};
const RUNS = [];
for (const q of ['low', 'high', 'ultra']) for (const tod of [0.4, 0.95]) for (const view of Object.keys(VIEWS)) RUNS.push({ q, tod, view });

function gpuName(gl) {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

const frame = () => new Promise((r) => requestAnimationFrame(r));

// Cost of a frame without waiting for vsync: render n frames back to back and wait for the GPU.
function cost(world, n = 15) {
  const gl = world.renderer.getContext(), px = new Uint8Array(4);
  world.frame(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t = performance.now();
  for (let i = 0; i < n; i++) world.frame(1 / 60);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return (performance.now() - t) / n;
}

async function measure(world, seconds) {
  const times = [];
  let last = await frame();
  const end = last + seconds * 1000;
  while (last < end) {
    world.frame(1 / 60);
    const now = await frame();
    times.push(now - last);
    last = now;
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return { fps: 1000 / avg, p95: times[Math.floor(times.length * 0.95)] };
}

export async function runBench(world, out) {
  const gl = world.renderer.getContext();
  const gpu = gpuName(gl);
  const lines = [
    `GPU: ${gpu}`,
    `${navigator.userAgent.match(/(Windows[^;)]*|Mac OS X [\d_]+|Linux[^;)]*)/)?.[0] ?? navigator.platform} · окно ${innerWidth}×${innerHeight} · devicePixelRatio ${devicePixelRatio}`,
  ];
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) lines.push('⚠ Браузер рисует без видеокарты: включите аппаратное ускорение (chrome://settings/system, chrome://gpu).');
  lines.push('', 'пресет  время  вид           FPS   p95, мс  кадр, мс  draw calls', '(кадр, мс — сколько стоит кадр без ожидания vsync; < 16 — есть запас до 60 FPS)');
  out.textContent = lines.join('\n') + '\n…';
  const results = [];
  for (const r of RUNS) {
    world.setQuality(r.q);
    world.setTimeOfDay(r.tod, true);
    const [x, y, z, yaw, pitch] = VIEWS[r.view];
    world.camera.position.set(x, y, z);
    world.camera.rotation.set(pitch, yaw, 0, 'YXZ');
    await measure(world, 1); // warm-up: shader compilation, first shadow map
    const m = await measure(world, 3);
    const calls = world.stats().calls, ms = cost(world);
    results.push({ ...r, ...m, ms, calls });
    lines.push(`${r.q.padEnd(7)} ${r.tod < 0.5 ? 'день ' : 'ночь '}  ${r.view.padEnd(12)} ${m.fps.toFixed(0).padStart(4)}  ${m.p95.toFixed(1).padStart(7)}  ${ms.toFixed(1).padStart(8)}  ${String(calls).padStart(6)}`);
    out.textContent = lines.join('\n') + '\n…';
  }
  const of = (q) => results.filter((r) => r.q === q);
  const minFps = (q) => Math.min(...of(q).map((r) => r.fps)), maxMs = (q) => Math.max(...of(q).map((r) => r.ms));
  // keep a margin: 60 FPS on screen and the frame itself under 14 ms
  const best = ['ultra', 'high', 'low'].find((q) => minFps(q) >= 55 && maxMs(q) <= 14) ?? 'low';
  lines.push('', `Рекомендуемый пресет для этого ноутбука: ${best}`);
  for (const q of ['low', 'high', 'ultra']) lines.push(`  ${q}: минимум ${minFps(q).toFixed(0)} FPS, худший кадр ${maxMs(q).toFixed(1)} мс`);
  out.textContent = lines.join('\n');
  console.table(results);
  return { gpu, results, best };
}
