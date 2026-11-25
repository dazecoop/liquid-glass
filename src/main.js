import hljs from "highlight.js/lib/core";
import { LiquidGlass } from "./glass.js";
import { initDeveloper } from "./developer.js";
import { initFps } from "./fps.js";
import { initComponents } from "./components.js";

document.documentElement.classList.add("js");

const pexels = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb`;

// One fixed hero backdrop; drag-and-drop still lets you look through the glass at your own image
const HERO_BG = 268533;

const signed = (v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

const PRESETS = [
  { key: "clear", label: "Clear" },
  { key: "frosted", label: "Frosted" },
  { key: "dark", label: "Dark" },
  { key: "prism", label: "Prism" },
  { key: "dome", label: "Dome" },
];

const $ = (sel) => document.querySelector(sel);
const scene = $("#scene");

// Almost no glass behind the dock: a hint of bend, a faint rim, no dispersion or zoom.
// It goes first so the lens copies it with its contents already in place.
new LiquidGlass(scene, {
  anchor: $("#dock"),
  refraction: 3,
  frost: 0,
  chroma: 0,
  zoom: 1,
  bevel: 20,
  specular: 0,
  fresnel: 0,
  rim: 0.2,
  tint: "rgb(0 0 0 / 0.3)",
});
// Phones and tablets get a smaller lens: every frame filters and repaints its whole area,
// so cutting it roughly in half keeps the frame rate up on mobile GPUs
const mobile = matchMedia("(max-width: 639px), (pointer: coarse)").matches;
const SHAPE = mobile ? { width: 200, height: 130, radius: 48 } : { width: 280, height: 180, radius: 64 };
const DOME = mobile ? { width: 160, height: 160, radius: 80 } : { width: 220, height: 220, radius: 110 };
const glass = new LiquidGlass(scene, SHAPE);

initFps($("#fps-value"), $("#fps-graph"));

// Developer panel, in its own section

let imageUrl = null;
const dev = initDeveloper({ glass, getImageUrl: () => imageUrl });

// Background: one fixed image, with drag-and-drop to look through the glass at your own

const bg = $("#bg");
let uploadUrl;

async function showImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  bg.src = src;
}

function select(url) {
  imageUrl = url;
  dev.render();
}

const heroUrl = `${pexels(HERO_BG)}&w=2560`;
select(heroUrl);
showImage(heroUrl);

async function useFile(file) {
  if (!file?.type.startsWith("image/")) return;
  const previous = uploadUrl;
  uploadUrl = URL.createObjectURL(file);
  select(null);
  await showImage(uploadUrl);
  if (previous) URL.revokeObjectURL(previous);
}

// Drag and drop

const dropEl = $("#drop");
let dragDepth = 0;
addEventListener("dragenter", (e) => {
  e.preventDefault();
  if (++dragDepth === 1) dropEl.dataset.active = "";
});
addEventListener("dragleave", () => {
  if (--dragDepth === 0) delete dropEl.dataset.active;
});
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  delete dropEl.dataset.active;
  useFile(e.dataTransfer.files[0]);
});

// Presets: tap a look and the lens takes it

const presetsEl = $("#presets");
const presetButtons = new Map();
let preset = "clear";

function markPreset(key) {
  preset = key;
  for (const [k, button] of presetButtons) button.setAttribute("aria-checked", String(k === key));
}

function applyPreset(key) {
  const look = LiquidGlass.presets[key];
  glass.set(key === "dome" ? { ...look, ...DOME } : { ...SHAPE, ...look });
  markPreset(key);
  dev.render();
}

for (const p of PRESETS) {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "radio";
  button.textContent = p.label;
  button.className =
    "shrink-0 rounded-full px-3 py-1 text-white/60 transition hover:text-white aria-checked:bg-white/15 aria-checked:text-white focus-visible:outline-2 focus-visible:outline-white";
  button.addEventListener("click", () => applyPreset(p.key));
  presetButtons.set(p.key, button);
  presetsEl.append(button);
}
markPreset(preset);

// Real buttons under the glass

let clicks = 0;
$("#count").addEventListener("click", (e) => {
  e.currentTarget.textContent = `Clicked ${++clicks} time${clicks === 1 ? "" : "s"}`;
});

// Pointer: the lens follows everywhere, over the UI too. It ignores pointer events, so
// everything under it stays clickable.

const hint = $("#hint");
let hintTimer;
const isUi = (e) => e.target instanceof Element && e.target.closest("[data-ui]");

// The lens belongs to the hero: it hides once its point is scrolled past, and comes back
// when the hero does
let lensWanted = false;
const overScene = (y) => {
  const r = scene.getBoundingClientRect();
  return y >= r.top && y < r.bottom;
};

function moveLens(x, y) {
  lensWanted = true;
  glass.moveTo(Math.max(0, Math.min(x, innerWidth)), Math.max(0, Math.min(y, innerHeight)));
}

// Start over the end of the title
const title = $("#title").getBoundingClientRect();
moveLens(title.left + title.width * 0.62, title.top + title.height * 0.72);

// Lock the lens in place with "L", so the pointer can wander off without dragging it along
const lockButton = $("#lock");
let locked = false;
function setLocked(value) {
  locked = value;
  lockButton.toggleAttribute("data-locked", locked);
  lockButton.inert = !locked;
  if (locked) glass.press(false);
}
lockButton.addEventListener("click", () => setLocked(false));
addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "l" || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.target.matches?.("input[type=text], textarea, [contenteditable]")) return;
  setLocked(!locked);
});

addEventListener("pointermove", (e) => {
  if (locked) return;
  if (!overScene(e.clientY)) {
    lensWanted = false;
    glass.show(false, { pop: true });
    return;
  }
  moveLens(e.clientX, e.clientY);
  hintTimer ??= setTimeout(() => hint.classList.add("opacity-0", "-translate-y-2"), 1200);
});

// Press only off the controls, so tapping a preset doesn't squash the lens
addEventListener("pointerdown", (e) => {
  if (locked || isUi(e) || !scene.contains(e.target)) return;
  moveLens(e.clientX, e.clientY);
  glass.press(true);
});
addEventListener("pointerup", () => glass.press(false));
addEventListener("pointercancel", () => glass.press(false));

// Keyboard nudging when nothing else has focus and the page is at the top, so the arrow
// keys still scroll everywhere else
addEventListener("keydown", (e) => {
  if (document.activeElement !== document.body || scrollY > 0) return;
  const step = e.shiftKey ? 60 : 16;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const move = moves[e.key];
  if (!move) return;
  e.preventDefault();
  moveLens(glass.x.target + move[0], glass.y.target + move[1]);
});

// Scrolling: the lens stays with the hero. Once its point scrolls out of it, the lens pops
// like a bubble, and it swells back when the hero returns. The page nav is solid black at the
// very top, and turns to frosted glass once the page has scrolled 40px.

const nav = $("#nav");
function onScroll() {
  glass.show(lensWanted && overScene(glass.y.target), { pop: true });
  nav.toggleAttribute("data-scrolled", scrollY > 40);
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Blocks rise into place once as they scroll in

const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.toggleAttribute("data-shown", true);
      reveal.unobserve(entry.target);
    }
  },
  { threshold: 0.15 },
);
document.querySelectorAll("[data-reveal]").forEach((el) => reveal.observe(el));

// Feature demos: each surface gets its own glass, built when the section comes near so the
// hero loads without them

const demos = new Map();
for (const img of document.querySelectorAll("[data-photo]")) {
  img.loading = "lazy";
  img.src = `${pexels(img.dataset.photo)}&w=${mobile ? 900 : 1600}`;
}

const nearFeatures = new IntersectionObserver(
  ([entry]) => {
    if (!entry.isIntersecting) return;
    nearFeatures.disconnect();
    for (const el of document.querySelectorAll("[data-demo]")) {
      const { preset: name, ...params } = JSON.parse(el.dataset.demo);
      const source = el.closest("[data-surface]");
      demos.set(el, new LiquidGlass(source, { anchor: el, button: "button" in el.dataset, ...LiquidGlass.presets[name], ...params }));
    }
    initDome();
  },
  { rootMargin: "800px 0px" },
);
nearFeatures.observe($("#features"));

// UI components: built when their section comes near, as the feature demos are
const nearComponents = new IntersectionObserver(
  ([entry]) => {
    if (!entry.isIntersecting) return;
    nearComponents.disconnect();
    initComponents($("#components"));
  },
  { rootMargin: "800px 0px" },
);
nearComponents.observe($("#components"));

// Dome: a lens living inside its tile. It follows the cursor, or a finger dragging it, and
// springs home to the middle when let go.
function initDome() {
  const surface = $("#dome-surface");
  const size = () => Math.round(surface.clientWidth * 0.5);
  const d = size();
  const dome = new LiquidGlass(surface, {
    container: surface,
    ...LiquidGlass.presets.dome,
    chroma: 0.12,
    refraction: 28,
    width: d,
    height: d,
    radius: d / 2,
  });
  dome.x.snap(surface.clientWidth / 2);
  dome.y.snap(surface.clientHeight / 2);
  dome.show(true);

  const follow = (x, y) => {
    const r = surface.getBoundingClientRect();
    dome.moveTo(Math.max(r.left, Math.min(x, r.right)), Math.max(r.top, Math.min(y, r.bottom)));
  };
  const home = () => {
    const r = surface.getBoundingClientRect();
    dome.moveTo(r.left + r.width / 2, r.top + r.height / 2);
  };
  new ResizeObserver(() => {
    const d = size();
    dome.set({ width: d, height: d, radius: d / 2 });
    home();
  }).observe(surface);

  // The lens itself is the handle, so a swipe elsewhere on the tile still scrolls the page
  Object.assign(dome.el.style, { pointerEvents: "auto", touchAction: "none", cursor: "grab" });
  let dragging = false;
  surface.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" || dragging) follow(e.clientX, e.clientY);
  });
  surface.addEventListener("pointerleave", () => {
    if (!dragging) home();
  });
  dome.el.addEventListener("pointerdown", (e) => {
    dragging = true;
    dome.el.setPointerCapture(e.pointerId);
    dome.el.style.cursor = "grabbing";
    dome.press(true);
    follow(e.clientX, e.clientY);
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    dome.el.style.cursor = "grab";
    dome.press(false);
    if (e.pointerType !== "mouse") home();
  };
  dome.el.addEventListener("pointerup", release);
  dome.el.addEventListener("pointercancel", release);
}

// Tone: chips for a few looks, sliders for the rest. Tone changes skip the map rebuild, so
// dragging stays smooth.
const toneChips = [...document.querySelectorAll("[data-tone]")];
const toneSliders = [...document.querySelectorAll("#tone-saturation, #tone-brightness")];

function paintTone() {
  for (const input of toneSliders) {
    const v = Number(input.value);
    input.parentElement.querySelector("output").textContent = signed(v);
    input.style.setProperty("--fill", `${((v - input.min) / (input.max - input.min)) * 100}%`);
  }
}

function setTone(tone) {
  for (const input of toneSliders) if (input.dataset.key in tone) input.value = tone[input.dataset.key];
  paintTone();
  demos.get($("#tone-demo"))?.set(tone);
  const match = (chip) => {
    const t = JSON.parse(chip.dataset.tone);
    return toneSliders.every((input) => Math.abs(Number(input.value) - t[input.dataset.key]) < 0.005);
  };
  for (const chip of toneChips) chip.setAttribute("aria-checked", String(match(chip)));
}

for (const chip of toneChips) chip.addEventListener("click", () => setTone(JSON.parse(chip.dataset.tone)));
for (const input of toneSliders) input.addEventListener("input", () => setTone({ [input.dataset.key]: Number(input.value) }));
paintTone();

// Lighting toggles
for (const chip of document.querySelectorAll("[data-light]")) {
  chip.addEventListener("click", () => {
    const on = chip.getAttribute("aria-pressed") !== "true";
    chip.setAttribute("aria-pressed", String(on));
    demos.get($("#light-demo"))?.set({ [chip.dataset.light]: on ? Number(chip.dataset.on) : 0 });
  });
}

// The demo buttons do something, so pressing them feels like pressing a button
// (Scoped to direct children: each button's glass holds a copy with its own spans and icons.)
const play = $("#play");
play.addEventListener("click", () => {
  const label = play.querySelector(":scope > span");
  const playing = label.textContent === "Play";
  label.textContent = playing ? "Pause" : "Play";
  play.querySelector(":scope > svg path").setAttribute("d", playing ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M7 4.5v15l13-7.5z");
});
const like = $("#like");
like.addEventListener("click", () => {
  const liked = like.getAttribute("aria-pressed") !== "true";
  like.setAttribute("aria-pressed", String(liked));
  like.querySelector(":scope > svg").setAttribute("fill", liked ? "currentColor" : "none");
});

// Presets tile: show a preset's settings, then try it on the hero lens

const tryEl = $("#try-presets");
const presetCode = $("#preset-code");
const tryChips = [];
let shownPreset = "frosted";

function showPreset(key) {
  shownPreset = key;
  for (const chip of tryChips) chip.setAttribute("aria-checked", String(chip.dataset.preset === key));
  const settings = Object.entries(LiquidGlass.presets[key])
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
    .join("\n");
  presetCode.innerHTML = hljs.highlight(`LiquidGlass.presets.${key} = {\n${settings}\n};`, { language: "javascript" }).value;
}

for (const p of PRESETS) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.role = "radio";
  chip.className = "chip";
  chip.textContent = p.label;
  chip.dataset.preset = p.key;
  chip.addEventListener("click", () => showPreset(p.key));
  tryChips.push(chip);
  tryEl.append(chip);
}
showPreset(shownPreset);

$("#try-preset").addEventListener("click", () => {
  applyPreset(shownPreset);
  scene.scrollIntoView();
});

// How it works, step 1: the layers start flat in one stack and pull apart as the diagram
// scrolls up the screen

const layersSvg = $("#how-layers");
const FLAT = 92;
const layers = [...layersSvg.querySelectorAll("[data-layer]")].map((el) => ({
  el,
  to: Number(el.dataset.layer),
  label: el.tagName === "text",
}));
let layersFrame = 0;

function explode() {
  layersFrame = 0;
  const r = layersSvg.getBoundingClientRect();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Starts once the diagram's top is 80% down the screen, after it has faded in, and
  // finishes when the top reaches 25%, so the whole move happens in plain view
  const raw = (innerHeight * 0.8 - r.top) / (innerHeight * 0.55);
  const t = reduced ? 1 : Math.max(0, Math.min(raw, 1));
  const e = t * t * (3 - 2 * t);
  for (const { el, to, label } of layers) {
    const y = FLAT + (to - FLAT) * e;
    if (label) {
      el.setAttribute("y", y + 80);
      el.style.opacity = Math.max(0, (e - 0.4) / 0.6);
    } else {
      el.setAttribute("transform", `matrix(1 0.5 -1 0.5 210 ${y})`);
    }
  }
}

const onLayersScroll = () => (layersFrame ||= requestAnimationFrame(explode));
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) addEventListener("scroll", onLayersScroll, { passive: true });
  else removeEventListener("scroll", onLayersScroll);
  explode();
}).observe(layersSvg);
explode();

// How it works: draw the hero lens's own displacement map and lighting layer, and redraw
// them while the section is in view and the lens changes

const mapCanvas = $("#how-map-canvas");
const rimCanvas = $("#how-rim-canvas");
let howVisible = false;

function drawMap() {
  const href = glass.filter.querySelector("feImage")?.getAttribute("href");
  if (!href) return;
  const img = new Image();
  img.onload = () => {
    const w = (mapCanvas.width = img.width);
    const h = (mapCanvas.height = img.height);
    const ctx = mapCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    let max = 1;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, Math.hypot(d[i] - 128, d[i + 1] - 128));
    for (let i = 0; i < d.length; i += 4) {
      const dx = d[i] - 128;
      const dy = d[i + 1] - 128;
      const m = Math.hypot(dx, dy) / max;
      // Hue from direction, lightness from distance, on the tile's near-black
      const hue = ((Math.atan2(dy, dx) / Math.PI) * 180 + 360) % 360;
      const [r, g, b] = hsl(hue, 0.85 * Math.min(m * 6, 1), 0.08 + 0.55 * Math.sqrt(m));
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  };
  img.src = href;
}

function drawRim() {
  const src = glass.rim;
  const pad = Math.round(src.width * 0.08);
  rimCanvas.width = src.width + pad * 2;
  rimCanvas.height = src.height + pad * 2;
  const ctx = rimCanvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, 0, rimCanvas.height);
  bg.addColorStop(0, "#2c2c2e");
  bg.addColorStop(1, "#0b0b0c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, rimCanvas.width, rimCanvas.height);
  ctx.drawImage(src, pad, pad);
}

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const drawHow = () => {
  if (!howVisible) return;
  drawMap();
  drawRim();
};
new MutationObserver(drawHow).observe(glass.filter, { childList: true });
new IntersectionObserver(([entry]) => {
  howVisible = entry.isIntersecting;
  drawHow();
}).observe($("#how"));
