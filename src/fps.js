// Frames per second, plus a sparkline of recent frame times: time runs left to right,
// taller bars are slower frames. The dashed line marks 60 fps.

const SAMPLES = 96;
const MAX_MS = 50;
const TARGET_MS = 1000 / 60;

export function initFps(valueEl, canvas) {
  const ctx = canvas.getContext("2d");
  const times = new Float32Array(SAMPLES);
  let head = 0;
  let last = performance.now();
  let since = last;
  let frames = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }
  resize();
  addEventListener("resize", resize);

  function draw() {
    const { width: w, height: h } = canvas;
    const bar = w / SAMPLES;
    ctx.clearRect(0, 0, w, h);

    const y = h - (TARGET_MS / MAX_MS) * h;
    ctx.fillStyle = "rgb(255 255 255 / 0.25)";
    for (let x = 0; x < w; x += bar * 3) ctx.fillRect(x, y, bar * 1.5, Math.max(1, h / 24));

    for (let i = 0; i < SAMPLES; i++) {
      const ms = times[(head + i) % SAMPLES];
      if (!ms) continue;
      const height = Math.max(1, (Math.min(ms, MAX_MS) / MAX_MS) * h);
      ctx.fillStyle = ms <= 20 ? "rgb(255 255 255 / 0.75)" : ms <= 34 ? "rgb(251 191 36)" : "rgb(248 113 113)";
      ctx.fillRect(i * bar, h - height, Math.max(1, bar - 0.5), height);
    }
  }

  function frame(now) {
    times[head] = now - last;
    head = (head + 1) % SAMPLES;
    last = now;
    frames++;
    if (now - since >= 250) {
      valueEl.textContent = Math.round((frames * 1000) / (now - since));
      frames = 0;
      since = now;
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
