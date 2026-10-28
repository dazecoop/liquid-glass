import { LiquidGlass } from "./glass.js";
import { initDeveloper } from "./developer.js";

const pexels = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb`;

const BACKGROUNDS = [
  { id: 268533, label: "Lake" },
  { id: 2662116, label: "Moraine" },
  { id: 3408744, label: "Aurora" },
  { id: 1323550, label: "Haze" },
  { id: 3225517, label: "Canyon" },
];

const SLIDERS = [
  { key: "width", label: "Width", min: 120, max: 520, step: 1, unit: "px" },
  { key: "height", label: "Height", min: 80, max: 400, step: 1, unit: "px" },
  { key: "radius", label: "Corners", min: 0, max: 200, step: 1, unit: "px" },
  { key: "refraction", label: "Refraction", min: 0, max: 120, step: 1, unit: "px" },
  { key: "frost", label: "Frost", min: 0, max: 24, step: 0.5, unit: "px" },
  { key: "chroma", label: "Dispersion", min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
];

const $ = (sel) => document.querySelector(sel);

let glass;
try {
  glass = new LiquidGlass($("#canvas"));
} catch (err) {
  $("#error").classList.replace("hidden", "grid");
  $("#error p").textContent = err.message;
  throw err;
}

// Developer drawer

let imageUrl = null;
const dev = initDeveloper({
  glass,
  getImageUrl: () => imageUrl,
  onToggle: (open) => {
    $("#overlay").toggleAttribute("data-dev", open);
    reclamp();
  },
});

// Backgrounds

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });

// The title is painted into the texture rather than the DOM, so the lens refracts it
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
let photo;

function compose(image) {
  const { dpr } = glass;
  const out = document.createElement("canvas");
  out.width = glass.canvas.width;
  out.height = glass.canvas.height;
  const ctx = out.getContext("2d");

  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const cover = Math.max(out.width / w, out.height / h);
  ctx.drawImage(image, (out.width - w * cover) / 2, (out.height - h * cover) / 2, w * cover, h * cover);

  ctx.scale(dpr, dpr);
  const cw = out.width / dpr;
  const ch = out.height / dpr;
  const x = Math.max(16, cw * 0.055);

  // Same layout as the Open Graph image: eyebrow, two-line title, subtitle
  ctx.font = `700 100px ${FONT}`;
  ctx.letterSpacing = "-3.3px";
  const titleWidth = ctx.measureText("Liquid").width / 100;
  // Fit the block between the header and the (expanded) dock
  const narrow = cw < 640;
  const areaTop = 64;
  const areaBottom = ch - (narrow ? 140 : 300);
  const size = 0.7 * Math.min((narrow ? cw - x * 2 : cw * 0.52) / titleWidth, (areaBottom - areaTop) / 2.55);
  const top = (areaTop + areaBottom) / 2 - size * 1.14; // eyebrow baseline, centring the block

  // Darken the left side so the text holds up on bright images
  const shade = ctx.createLinearGradient(0, 0, cw, 0);
  shade.addColorStop(0, "rgb(2 6 18 / 0.6)");
  shade.addColorStop(0.55, "rgb(2 6 18 / 0.25)");
  shade.addColorStop(1, "rgb(2 6 18 / 0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, cw, ch);

  ctx.shadowColor = "rgb(0 0 0 / 0.3)";
  ctx.shadowBlur = size * 0.15;

  const eyebrow = "WEBGL · ONE SHADER · NO DEPENDENCIES";
  let eyebrowSize = size * 0.147;
  ctx.font = `600 ${eyebrowSize}px ${FONT}`;
  ctx.letterSpacing = `${eyebrowSize * 0.18}px`;
  const eyebrowWidth = ctx.measureText(eyebrow).width;
  if (eyebrowWidth > cw - x * 2) {
    eyebrowSize *= (cw - x * 2) / eyebrowWidth;
    ctx.font = `600 ${eyebrowSize}px ${FONT}`;
    ctx.letterSpacing = `${eyebrowSize * 0.18}px`;
  }
  ctx.fillStyle = "rgb(255 255 255 / 0.6)";
  ctx.fillText(eyebrow, x + size * 0.04, top);

  ctx.font = `700 ${size}px ${FONT}`;
  ctx.letterSpacing = `${-size * 0.033}px`;
  ctx.fillStyle = "#fff";
  ctx.fillText("Liquid", x, top + size);
  ctx.fillText("Glass", x, top + size * 1.93);

  ctx.font = `400 ${Math.max(15, size * 0.2)}px ${FONT}`;
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "rgb(255 255 255 / 0.75)";
  ctx.fillText("A refraction lens for the web", x + size * 0.04, top + size * 2.4);

  return out;
}

function showImage(image) {
  photo = image;
  return glass.setImage(compose(image));
}

let recomposeTimer;
addEventListener("resize", () => {
  clearTimeout(recomposeTimer);
  recomposeTimer = setTimeout(() => photo && glass.setImage(compose(photo), { fade: false }), 120);
});

const backgroundsEl = $("#backgrounds");
let currentButton;

function select(button, url = null) {
  currentButton?.setAttribute("aria-checked", "false");
  button?.setAttribute("aria-checked", "true");
  currentButton = button;
  imageUrl = url;
  dev.render();
}

for (const bg of BACKGROUNDS) {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "radio";
  button.ariaLabel = bg.label;
  button.title = bg.label;
  button.setAttribute("aria-checked", "false");
  button.className =
    "size-11 shrink-0 overflow-hidden rounded-xl ring-2 ring-transparent ring-offset-2 ring-offset-transparent transition hover:scale-105 active:scale-95 aria-checked:ring-white focus-visible:outline-none focus-visible:ring-white/70";
  button.innerHTML = `<img src="${pexels(bg.id)}&w=120&h=120&fit=crop" alt="" class="size-full object-cover" draggable="false" />`;
  button.addEventListener("click", async () => {
    if (button === currentButton) return;
    const url = `${pexels(bg.id)}&w=2560`;
    select(button, url);
    showImage(await loadImage(url));
  });
  backgroundsEl.append(button);
}

backgroundsEl.firstElementChild.click();

async function useFile(file) {
  if (!file?.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    select(null);
    await showImage(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

$("#upload").addEventListener("change", (e) => {
  useFile(e.target.files[0]);
  e.target.value = "";
});

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

// Sliders

const slidersEl = $("#sliders");
for (const s of SLIDERS) {
  const id = `slider-${s.key}`;
  const format = s.format ?? ((v) => `${v}${s.unit}`);
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="mb-1 flex items-baseline justify-between text-xs">
      <label for="${id}" class="font-medium text-white/80">${s.label}</label>
      <output for="${id}" class="text-white/50 tabular-nums"></output>
    </div>
    <input id="${id}" type="range" class="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${glass.params[s.key]}" />
  `;
  const input = wrap.querySelector("input");
  const output = wrap.querySelector("output");
  const update = () => {
    const value = Number(input.value);
    output.textContent = format(value);
    input.style.setProperty("--fill", `${((value - s.min) / (s.max - s.min)) * 100}%`);
    glass.set({ [s.key]: value });
  };
  input.addEventListener("input", update);
  update();
  slidersEl.append(wrap);
}

const toggle = $("#toggle");
const controls = $("#controls");
toggle.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  controls.toggleAttribute("data-collapsed", !open);
  controls.inert = !open;
});

// Start collapsed on small screens so the lens has room
if (matchMedia("(max-width: 639px)").matches) toggle.click();

// Pointer

const hint = $("#hint");
const dock = $("[data-ui]");
let hintTimer;
const isUi = (e) => e.target instanceof Element && e.target.closest("[data-ui]");

const drawer = $("#dev");

// Keep the lens clear of the dock (and the open drawer) so changes stay visible
const DOCK_GAP = 24;
function moveLens(x, y) {
  const halfWidth = (glass.params.width / 2) * 1.12; // room for the pressed scale
  const halfHeight = (glass.params.height / 2) * 1.12;
  const maxY = dock.getBoundingClientRect().top - halfHeight - DOCK_GAP;
  y = Math.max(halfHeight, Math.min(y, maxY));
  if (dev.isOpen) {
    const maxX = innerWidth - drawer.offsetWidth - 12 - halfWidth - DOCK_GAP;
    if (maxX > halfWidth) x = Math.min(x, maxX);
  }
  glass.moveTo(x, y);
}
function reclamp() {
  moveLens(glass.x.target, glass.y.target);
}

new ResizeObserver(reclamp).observe(dock);
addEventListener("resize", reclamp);
slidersEl.addEventListener("input", () => {
  reclamp();
  dev.render();
});

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
  setLocked(!locked);
});

addEventListener("pointermove", (e) => {
  if (locked || isUi(e)) return;
  moveLens(e.clientX, e.clientY);
  hintTimer ??= setTimeout(() => hint.classList.add("opacity-0", "-translate-y-2"), 1200);
});

addEventListener("pointerdown", (e) => {
  if (locked || isUi(e)) return;
  moveLens(e.clientX, e.clientY);
  glass.press(true);
});
addEventListener("pointerup", () => glass.press(false));
addEventListener("pointercancel", () => glass.press(false));

// Keyboard nudging when nothing else has focus
addEventListener("keydown", (e) => {
  if (document.activeElement !== document.body) return;
  const step = e.shiftKey ? 60 : 16;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const move = moves[e.key];
  if (!move) return;
  e.preventDefault();
  moveLens(glass.x.target + move[0], glass.y.target + move[1]);
});
