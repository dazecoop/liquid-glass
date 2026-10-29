import { LiquidGlass } from "./glass.js";
import { initDeveloper } from "./developer.js";
import { initFps } from "./fps.js";

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
const scene = $("#scene");

// Almost no glass behind the dock: a hint of bend, a faint rim, no dispersion or zoom.
// It goes first so the lens copies it with its contents already in place.
new LiquidGlass(scene, { anchor: $("#dock"), refraction: 3, frost: 0, chroma: 0, zoom: 1, rim: 0.2, tint: "rgb(0 0 0 / 0.3)" });
// Phones and tablets get a smaller lens: every frame filters and repaints its whole area,
// so cutting it roughly in half keeps the frame rate up on mobile GPUs
const mobile = matchMedia("(max-width: 639px), (pointer: coarse)").matches;
const glass = new LiquidGlass(scene, mobile ? { width: 200, height: 130, radius: 48, refraction: 30 } : {});

initFps($("#fps-value"), $("#fps-graph"));

// Developer drawer

let imageUrl = null;
const dev = initDeveloper({
  glass,
  getImageUrl: () => imageUrl,
  onToggle: (open) => $("#overlay").toggleAttribute("data-dev", open),
});

// Backgrounds

const bg = $("#bg");
let uploadUrl;

async function showImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  bg.src = src;
}

const backgroundsEl = $("#backgrounds");
let currentButton;

function select(button, url = null) {
  currentButton?.setAttribute("aria-checked", "false");
  button?.setAttribute("aria-checked", "true");
  currentButton = button;
  imageUrl = url;
  dev.render();
}

for (const item of BACKGROUNDS) {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "radio";
  button.ariaLabel = item.label;
  button.title = item.label;
  button.setAttribute("aria-checked", "false");
  button.className =
    "size-11 shrink-0 overflow-hidden rounded-xl ring-2 ring-transparent ring-offset-2 ring-offset-transparent transition hover:scale-105 active:scale-95 aria-checked:ring-white focus-visible:outline-none focus-visible:ring-white/70";
  button.innerHTML = `<img src="${pexels(item.id)}&w=120&h=120&fit=crop" alt="" class="size-full object-cover" draggable="false" />`;
  button.addEventListener("click", () => {
    if (button === currentButton) return;
    const url = `${pexels(item.id)}&w=2560`;
    select(button, url);
    showImage(url);
  });
  backgroundsEl.append(button);
}

backgroundsEl.firstElementChild.click();

async function useFile(file) {
  if (!file?.type.startsWith("image/")) return;
  const previous = uploadUrl;
  uploadUrl = URL.createObjectURL(file);
  select(null);
  await showImage(uploadUrl);
  if (previous) URL.revokeObjectURL(previous);
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
    <input id="${id}" type="range" autocomplete="off" class="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${glass.params[s.key]}" />
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
slidersEl.addEventListener("input", () => dev.render());

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

function moveLens(x, y) {
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
  moveLens(e.clientX, e.clientY);
  hintTimer ??= setTimeout(() => hint.classList.add("opacity-0", "-translate-y-2"), 1200);
});

// Press only off the controls, so dragging a slider doesn't squash the lens
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
