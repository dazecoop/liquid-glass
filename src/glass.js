// Liquid glass over live HTML. The glass holds a copy of the source element, lined up with
// the original, and bends it with an SVG filter. Plain `filter: url()` on an element works in
// Chrome, Firefox and Safari, unlike `backdrop-filter: url()`, which is Chrome only.
//
// Two modes:
// - A lens that follows moveTo(), floating above the page, or inside an element
//   ({ container }) so it scrolls with it and is clipped to it.
// - Glass anchored to an element ({ anchor }), filling it as its background, with the
//   element's own content on top. Its copy leaves the anchor out, so nothing is doubled.
//
// A big source, such as a whole page behind a header, can take { throttle } in ms: changes
// then re-copy it at most that often.
//
// Safari quirks this works around:
// - It drops an SVG filter entirely when the filtered content has GPU-composited layers, so
//   the copy loses backdrop-filter, will-change and animations.
// - It scales transformed content inside an SVG filter wrongly on retina screens, so the
//   copy is moved with left/top, and magnification scales the filtered layer from outside.
//
// Frost is a CSS blur() around the SVG filter rather than feGaussianBlur inside it, which
// keeps it on the GPU in Firefox.
//
// Lighting treats the rim as the edge of a curved surface: its 3D normal tilts outward as
// the bevel rounds over, which gives a Blinn-Phong specular spot and a fresnel edge glow.

const SVG_NS = "http://www.w3.org/2000/svg";
const LIGHT = [-0.55, -0.83]; // top-left, y down
const LIGHT_HEIGHT = 0.5; // sine of the light's elevation above the glass
const LUMA = [0.2126, 0.7152, 0.0722];
// The rim profile is a circular arc, cut off just short of vertical: a truly vertical edge
// bends without limit, so moving the lens a pixel would make the rim's refraction jump
const ARC = 0.94;
const ARC_DROP = 1 - Math.sqrt(1 - ARC * ARC);
// Critically damped, about 0.3s to settle: hover and press on button glass
const UI_SPRING = { stiffness: 440, damping: 42 };
const CLONE_CSS = `
  [data-glass-copy], [data-glass-copy] * {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    will-change: auto !important;
    animation: none !important;
    transition: none !important;
  }`;
let uid = 0;

// Critically-ish damped spring, integrated per frame
class Spring {
  constructor(value, { stiffness = 260, damping = 26 } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  step(dt) {
    const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += force * dt;
    this.value += this.velocity * dt;
  }

  snap(value) {
    this.value = this.target = value;
    this.velocity = 0;
  }

  get settled() {
    return Math.abs(this.target - this.value) < 0.01 && Math.abs(this.velocity) < 0.01;
  }
}

function sdRoundBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Child-index path from root down to el, for finding el's counterpart in a copy
function pathTo(root, el) {
  const path = [];
  for (let n = el; n && n !== root; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n));
  return path;
}

function follow(root, path) {
  let n = root;
  for (const i of path) n = n?.children[i];
  return n;
}

const insideGlass = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest("[data-glass]");

export class LiquidGlass {
  // Starting looks. Each is plain parameters: glass.set(LiquidGlass.presets.frosted).
  // Dome rounds the bevel all the way to the middle, so it reads best on a circle.
  static presets = {
    clear: { refraction: 40, frost: 2, chroma: 0.4, zoom: 1.08, bevel: 35, specular: 0.35, fresnel: 0.3, brightness: 0, saturation: 0, tint: "", rim: 1 },
    frosted: { refraction: 24, frost: 14, chroma: 0.15, zoom: 1, bevel: 30, specular: 0.5, fresnel: 0.5, brightness: 0.08, saturation: 0.3, tint: "rgb(255 255 255 / 0.08)", rim: 1 },
    dark: { refraction: 32, frost: 6, chroma: 0.2, zoom: 1.04, bevel: 35, specular: 0.3, fresnel: 0.2, brightness: -0.18, saturation: -0.2, tint: "rgb(0 0 0 / 0.25)", rim: 0.6 },
    prism: { refraction: 80, frost: 0, chroma: 1, zoom: 1.12, bevel: 50, specular: 0.25, fresnel: 0.4, brightness: 0.02, saturation: 0.5, tint: "", rim: 0.8 },
    dome: { refraction: 50, frost: 0, chroma: 0.2, zoom: 1.35, bevel: 160, specular: 0.7, fresnel: 0.6, brightness: 0, saturation: 0.1, tint: "", rim: 1 },
  };

  constructor(source, { anchor = null, container = null, button = false, throttle = 0, ...params } = {}) {
    this.source = source;
    this.anchor = anchor;
    this.container = anchor ? null : container;
    this.button = Boolean(button && anchor);
    this.throttle = throttle;
    this.syncedAt = -Infinity;
    this.params = {
      width: 280,
      height: 180,
      radius: 64,
      ...LiquidGlass.presets.clear,
      ...params,
    };

    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.x = new Spring(innerWidth / 2);
    this.y = new Spring(innerHeight / 2);
    this.scale = new Spring(1, { stiffness: 320, damping: 18 });
    this.stretchX = new Spring(1, { stiffness: 180, damping: 14 });
    this.stretchY = new Spring(1, { stiffness: 180, damping: 14 });
    this.springs = [this.x, this.y, this.scale, this.stretchX, this.stretchY];
    this.hovered = new Spring(0, UI_SPRING);
    this.pressed = new Spring(0, UI_SPRING);
    this.scrolled = new Set();
    this.popScale = 1;

    this.#build();
    this.#observe();
    this.shapeDirty = true;
    this.copyDirty = true;
    this.placeDirty = true;

    this.last = performance.now();
    requestAnimationFrame((t) => this.#frame(t));
  }

  #build() {
    const id = `liquid-glass-${++uid}`;
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("aria-hidden", "true");
    this.svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    this.svg.innerHTML = `<style>${CLONE_CSS}</style><filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB" />`;
    this.filter = this.svg.querySelector("filter");

    this.el = document.createElement("div");
    this.el.dataset.glass = "";
    this.el.setAttribute("aria-hidden", "true");
    this.el.inert = true;
    this.el.style.cssText = "pointer-events:none;overflow:hidden;box-shadow:0 12px 34px -6px rgb(0 0 0 / 0.35)";
    if (this.anchor) {
      // Sit behind the anchor's content, inside its own stacking context
      if (getComputedStyle(this.anchor).position === "static") this.anchor.style.position = "relative";
      this.anchor.style.isolation = "isolate";
      this.el.style.cssText += ";position:absolute;inset:0;z-index:-1;border-radius:inherit";
    } else {
      const position = this.container ? "absolute;z-index:1" : "fixed;z-index:2147483000";
      this.el.style.cssText += `;position:${position};left:0;top:0;will-change:transform;opacity:0;transition:opacity .3s`;
      if (this.container && getComputedStyle(this.container).position === "static") this.container.style.position = "relative";
    }

    this.frost = document.createElement("div");
    this.frost.style.cssText = "position:absolute";

    this.view = document.createElement("div");
    this.view.style.cssText = `position:absolute;inset:0;overflow:hidden;filter:url(#${id})`;

    this.copyHost = document.createElement("div");
    this.copyHost.style.cssText = "position:absolute;left:0;top:0";

    // Rim lighting, sheen and the milky body
    this.rim = document.createElement("canvas");
    this.rim.style.cssText = "position:absolute;inset:0;width:100%;height:100%";

    this.view.append(this.copyHost);
    this.frost.append(this.view);
    this.el.append(this.frost, this.rim);
    document.body.append(this.svg);
    (this.anchor ?? this.container ?? document.body).prepend(this.el);

    if (this.anchor) {
      new ResizeObserver(() => {
        this.set({
          width: this.anchor.offsetWidth,
          height: this.anchor.offsetHeight,
          radius: parseFloat(getComputedStyle(this.anchor).borderTopLeftRadius) || 0,
        });
      }).observe(this.anchor);
    }

    if (this.button) {
      // Hover brightens, press flattens the bevel and tightens the shadow
      const a = this.anchor;
      const release = () => (this.pressed.target = 0);
      a.addEventListener("pointerenter", () => (this.hovered.target = 1));
      a.addEventListener("pointerleave", () => {
        this.hovered.target = 0;
        release();
      });
      a.addEventListener("pointerdown", () => (this.pressed.target = 1));
      a.addEventListener("pointerup", release);
      a.addEventListener("pointercancel", release);
      a.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") this.pressed.target = 1;
      });
      a.addEventListener("keyup", release);
      a.addEventListener("blur", release);
    }
  }

  #observe() {
    const dirty = () => (this.copyDirty = true);
    // Changes inside any glass (copies being swapped, lenses moving) don't count
    new MutationObserver((records) => {
      if (records.some((r) => !insideGlass(r.target))) dirty();
    }).observe(this.source, { subtree: true, childList: true, attributes: true, characterData: true });
    this.source.addEventListener("input", dirty, true);
    this.source.addEventListener(
      "scroll",
      (e) => {
        if (insideGlass(e.target)) return;
        this.scrolled.add(e.target);
        dirty();
      },
      true,
    );
    addEventListener("resize", dirty);
    // Page scroll only moves the source, so just re-measure it
    addEventListener("scroll", () => (this.rectDirty = true), { passive: true });
  }

  #syncCopy() {
    const copy = this.source.cloneNode(true);
    copy.dataset.glassCopy = "";

    // Live state that cloning doesn't carry over
    const live = "input, textarea, select, canvas";
    const to = copy.querySelectorAll(live);
    this.source.querySelectorAll(live).forEach((src, i) => {
      const dst = to[i];
      if ("value" in src && src.type !== "file") dst.value = src.value;
      if ("checked" in src) dst.checked = src.checked;
      if (src instanceof HTMLCanvasElement) dst.getContext("2d")?.drawImage(src, 0, 0);
    });
    const scrolls = [];
    for (const el of this.scrolled) {
      if (!this.source.contains(el)) this.scrolled.delete(el);
      else scrolls.push([follow(copy, pathTo(this.source, el)), el.scrollLeft, el.scrollTop]);
    }

    // Anchored glass shows what's behind the anchor, so the anchor itself goes
    if (this.anchor && this.source.contains(this.anchor)) follow(copy, pathTo(this.source, this.anchor))?.remove();
    // A lens inside its own source leaves itself out the same way
    else if (this.source.contains(this.el)) follow(copy, pathTo(this.source, this.el))?.remove();

    // Glass inside the copy keeps its own copy, but no deeper, so copies can't nest forever
    for (const glass of copy.querySelectorAll("[data-glass]")) {
      for (const inner of glass.querySelectorAll("[data-glass]")) inner.remove();
    }

    copy.removeAttribute("id");
    for (const el of copy.querySelectorAll("[id]")) el.removeAttribute("id");

    const rect = this.source.getBoundingClientRect();
    this.sourceRect = rect;
    this.containerRect = this.container?.getBoundingClientRect();
    Object.assign(copy.style, {
      position: "absolute",
      inset: "auto",
      left: "0",
      top: "0",
      margin: "0",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    this.copyHost.replaceChildren(copy);
    for (const [el, left, top] of scrolls) el?.scrollTo(left, top);
    this.copyDirty = false;
  }

  #buildShape() {
    const { width, height, radius, bevel: depth, refraction, frost, chroma, zoom, specular, fresnel, tint, rim: rimStrength } =
      this.params;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const hw = width / 2;
    const hh = height / 2;
    const r = Math.min(radius, hw, hh);
    const bevel = Math.max(Math.min(depth, hw, hh), 1);
    const sdf = (x, y) => sdRoundBox(x, y, hw, hh, r);
    const normal = (px, py, step) => {
      const nx = sdf(px + step, py) - sdf(px - step, py);
      const ny = sdf(px, py + step) - sdf(px, py - step);
      const len = Math.hypot(nx, ny) || 1;
      return [nx / len, ny / len];
    };

    // Zoom isn't in the displacement map: the filtered layer is built 1/zoom the size and
    // scaled up. Baked into the map, zoom was stored in 8-bit steps of about half a pixel, and
    // moving the lens swept those steps across the content, so it jumped. The map now only
    // holds the rim, and the middle doesn't move at all. Below, m* sizes are in that layer.
    const z = zoom;
    const mhw = hw / z;
    const mhh = hh / z;
    const mbevel = bevel / z;
    const mrefraction = refraction / z;
    const msdf = (x, y) => sdRoundBox(x, y, mhw, mhh, r / z);
    const mres = dpr * Math.max(z, 1);

    // The blur reaches past the lens edge, so the filtered area overhangs it by `pad`
    const pad = Math.ceil((frost * 1.5) / z);
    this.inner = { x: mhw + pad, y: mhh + pad };

    // Displacement map: a circular-bevel rim, encoded around 0.5. It's drawn at device
    // resolution, since the rim bends steeply and a coarser map shows steps.
    const scale = mrefraction * 2 + 1;
    const map = document.createElement("canvas");
    map.width = Math.ceil((mhw + pad) * 2 * mres);
    map.height = Math.ceil((mhh + pad) * 2 * mres);
    const mctx = map.getContext("2d");
    const md = mctx.createImageData(map.width, map.height);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const px = (x + 0.5) / mres - mhw - pad;
        const py = (y + 0.5) / mres - mhh - pad;
        let ox = 0;
        let oy = 0;
        const d = msdf(px, py);
        if (d < 0 && d > -mbevel && refraction > 0) {
          const rim = (1 + d / mbevel) * ARC;
          const bend = ((1 - Math.sqrt(1 - rim * rim)) / ARC_DROP) * mrefraction;
          const nx = msdf(px + 0.5 / mres, py) - msdf(px - 0.5 / mres, py);
          const ny = msdf(px, py + 0.5 / mres) - msdf(px, py - 0.5 / mres);
          const len = Math.hypot(nx, ny) || 1;
          ox = (nx / len) * bend;
          oy = (ny / len) * bend;
        }
        const i = (y * map.width + x) * 4;
        md.data[i] = (0.5 - ox / scale) * 255;
        md.data[i + 1] = (0.5 - oy / scale) * 255;
        md.data[i + 3] = 255;
      }
    }
    mctx.putImageData(md, 0, 0);

    const rim = this.rim;
    rim.width = Math.ceil(width * dpr);
    rim.height = Math.ceil(height * dpr);
    const rctx = rim.getContext("2d");
    const rd = rctx.createImageData(rim.width, rim.height);
    const lx = LIGHT[0] / Math.hypot(...LIGHT);
    const ly = LIGHT[1] / Math.hypot(...LIGHT);
    // Blinn-Phong half vector between the light and a viewer looking straight down
    const flat = Math.sqrt(1 - LIGHT_HEIGHT ** 2);
    const half = [lx * flat, ly * flat, LIGHT_HEIGHT + 1];
    const halfLen = Math.hypot(...half);
    const [hx, hy, hz] = half.map((v) => v / halfLen);
    for (let y = 0; y < rim.height; y++) {
      const py = (y + 0.5) / dpr - hh;
      const sheen = (1 - (py + hh) / height) * 0.05;
      for (let x = 0; x < rim.width; x++) {
        const px = (x + 0.5) / dpr - hw;
        const d = sdf(px, py);
        if (d > 0) continue;
        let a = 0.06 + sheen;
        if (d > -bevel) {
          const amt = 1 + d / bevel;
          const [nx, ny] = normal(px, py, 1 / dpr);
          const facing = nx * lx + ny * ly;
          const light = amt ** 3 * (0.55 * Math.max(facing, 0) + 0.22 * Math.max(-facing, 0));
          const hairline = (1 - Math.min(-d / 1.5, 1)) * 0.35;
          a += (light + hairline) * rimStrength;
          // The bevel is a quarter circle, so amt is the sine of the surface's tilt
          const nz = Math.sqrt(1 - amt * amt);
          const spec = Math.max(nx * amt * hx + ny * amt * hy + nz * hz, 0) ** 48;
          a += specular * spec * 1.4 + fresnel * (1 - nz) ** 3 * 0.5;
        }
        const i = (y * rim.width + x) * 4;
        rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = 255;
        rd.data[i + 3] = Math.min(a, 1) * 255;
      }
    }
    rctx.putImageData(rd, 0, 0);
    rim.style.background = tint;

    // One displacement pass, or one per colour channel for dispersion, then the tone
    const href = map.toDataURL();
    const c = chroma * 0.35;
    const displace = (k, result) =>
      `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale * k}" xChannelSelector="R" yChannelSelector="G" result="${result}" />`;
    this.filterBase =
      `<feImage href="${href}" result="map" preserveAspectRatio="none" />` +
      (c > 0.001
        ? displace(1 + c, "dr") +
          displace(1, "dg") +
          displace(1 - c, "db") +
          `<feColorMatrix in="dr" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
           <feColorMatrix in="dg" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
           <feColorMatrix in="db" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
           <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg" />
           <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1" />`
        : displace(1, "out"));
    this.#writeFilter();

    Object.assign(this.frost.style, {
      left: `${hw - mhw - pad}px`,
      top: `${hh - mhh - pad}px`,
      width: `${(mhw + pad) * 2}px`,
      height: `${(mhh + pad) * 2}px`,
      transform: z === 1 ? "" : `scale(${z})`,
    });
    this.#applyButton();
    if (!this.anchor) {
      this.el.style.width = `${width}px`;
      this.el.style.height = `${height}px`;
      this.el.style.borderRadius = `${r}px`;
    }
    this.shapeDirty = false;
  }

  // Saturation around Rec. 709 luma, then brightness as an offset, in one matrix
  #tone() {
    const { brightness: b, saturation } = this.params;
    if (!b && !saturation) return "";
    const s = 1 + saturation;
    const rows = [0, 1, 2].map((i) =>
      [...LUMA.map((l, j) => l * (1 - s) + (i === j ? s : 0)), 0, b].map((v) => +v.toFixed(4)).join(" "),
    );
    return `<feColorMatrix type="matrix" values="${rows.join("  ")}  0 0 0 1 0" />`;
  }

  // The whole filter is rewritten even when only the tone changes: Safari and Firefox can
  // keep showing the old result when a step is removed from a live filter. The map, the
  // expensive part, is reused, so a tone change stays cheap.
  #writeFilter() {
    this.filter.innerHTML = this.filterBase + this.#tone();
    this.displacers = [...this.filter.querySelectorAll("feDisplacementMap")].map((el) => [el, Number(el.getAttribute("scale"))]);
  }

  // Frost blur, plus the button's hover and press state
  #applyButton() {
    const { frost } = this.params;
    const parts = frost > 0 ? [`blur(${frost / 2 / this.params.zoom}px)`] : [];
    if (this.button) {
      const h = this.hovered.value;
      const p = this.pressed.value;
      for (const [el, base] of this.displacers) el.setAttribute("scale", base * (1 - 0.6 * p));
      parts.push(`brightness(${1 + 0.12 * h - 0.04 * p})`);
      this.el.style.boxShadow = `0 ${12 - 8 * p}px ${34 - 18 * p}px -6px rgb(0 0 0 / ${0.35 + 0.15 * p})`;
    }
    this.frost.style.filter = parts.join(" ") || "none";
  }

  // Keep the copy lined up with the original under the glass. Squash and press scale the whole
  // lens, copy included, since Safari can't take a transform on the copy itself.
  #place() {
    const { width, height } = this.params;
    const source = this.sourceRect;
    // Whole device pixels: off the pixel grid the filtered copy is resampled and shimmers, but
    // whole CSS pixels are 2 device pixels on retina, and slow moves visibly step
    const dpr = devicePixelRatio || 1;
    const snap = (v) => Math.round(v * dpr) / dpr;
    let left, top;

    if (this.anchor) {
      ({ left, top } = this.anchor.getBoundingClientRect());
    } else {
      const s = this.scale.value * this.popScale;
      left = snap(this.x.value - width / 2);
      top = snap(this.y.value - height / 2);
      this.el.style.transform =
        `translate(${left}px, ${top}px) scale(${s * this.stretchX.value}, ${s * this.stretchY.value})`;
      // Inside a container the springs run in its coordinates; the copy needs the viewport's
      if (this.container) {
        left += this.containerRect.left;
        top += this.containerRect.top;
      }
    }

    // The copy sits unscaled around the lens centre, so the layer's zoom magnifies it there
    this.copyHost.style.left = `${snap(this.inner.x + source.left - left - width / 2)}px`;
    this.copyHost.style.top = `${snap(this.inner.y + source.top - top - height / 2)}px`;
  }

  // Moves the lens to a point in viewport (client) coordinates
  moveTo(x, y) {
    if (this.container) {
      const { left, top } = this.container.getBoundingClientRect();
      x -= left;
      y -= top;
    }
    if (this.reducedMotion) {
      this.x.snap(x);
      this.y.snap(y);
    } else {
      this.x.target = x;
      this.y.target = y;
    }
    this.show(true, { pop: true });
  }

  press(down) {
    this.scale.target = down ? 1.12 : 1;
    if (this.reducedMotion) this.scale.snap(this.scale.target);
  }

  set(params) {
    const toneOnly = Object.keys(params).every((k) => k === "brightness" || k === "saturation");
    Object.assign(this.params, params);
    if (toneOnly && !this.shapeDirty && this.filterBase) {
      this.#writeFilter();
      this.#applyButton();
    } else this.shapeDirty = true;
  }

  // Fades the lens in or out. With { pop: true } it pops like a bubble on the way out and
  // swells back in. The pop runs through the frame loop's own transform: a separate CSS
  // `scale` would also scale the lens's position, and it would dart away as it popped.
  show(visible, { pop = false } = {}) {
    if (visible === this.visible) return;
    this.visible = visible;
    this.el.getAnimations().forEach((a) => a.cancel());
    if (!pop || this.reducedMotion) {
      this.pop = null;
      this.popScale = 1;
      this.el.style.transition = "opacity .3s";
      this.el.style.opacity = visible ? "1" : "0";
      return;
    }
    this.el.style.transition = "none";
    this.pop = { visible, start: performance.now(), burst: !visible };
  }

  // A bubble swells for a moment, then its film is gone at once. Coming back, it grows from
  // smaller with a little overshoot.
  #popFrame(now) {
    const { visible, start } = this.pop;
    const t = now - start;
    let scale, opacity;
    if (visible) {
      const k = Math.min(t / 460, 1);
      const back = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2; // ease-out-back
      scale = 0.6 + 0.4 * back;
      opacity = Math.min(t / 140, 1);
    } else {
      const k = Math.min(t / 110, 1);
      scale = 1 + 0.14 * k * k;
      opacity = t < 110 ? 1 : 0;
      if (t >= 110 && this.pop.burst) {
        this.pop.burst = false;
        this.#burst();
      }
    }
    this.popScale = scale;
    this.el.style.opacity = String(opacity);
    if (t >= (visible ? 460 : 110)) {
      this.pop = null;
      this.popScale = 1;
    }
  }

  // A ring flash and droplets flying off the rim
  #burst() {
    const r = this.el.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const layer = this.container ?? document.body;
    const origin = this.container ? this.container.getBoundingClientRect() : { left: 0, top: 0 };
    const position = this.container ? "absolute" : "fixed";
    const z = this.container ? 2 : 2147483000;
    const add = (css, frames, timing) => {
      const el = document.createElement("div");
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = `position:${position};pointer-events:none;z-index:${z};${css}`;
      layer.append(el);
      el.animate(frames, { fill: "forwards", ...timing }).finished.then(() => el.remove());
    };

    add(
      `left:${r.left - origin.left}px;top:${r.top - origin.top}px;width:${r.width}px;height:${r.height}px;` +
        `border-radius:${this.el.style.borderRadius};box-shadow:inset 0 0 0 1px rgb(255 255 255 / .8)`,
      [
        { opacity: 0.8, transform: "scale(1)" },
        { opacity: 0, transform: "scale(1.18)" },
      ],
      { duration: 200, easing: "cubic-bezier(.2,.7,.3,1)" },
    );

    // Droplets leave the rim along its normal, fly out fast, then slow and drop a little
    const count = 22;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const size = 3 + Math.random() * 4;
      const reach = 18 + Math.random() * 46;
      const fall = 14 + Math.random() * 22;
      const x = cx + (ux * r.width) / 2 - origin.left - size / 2;
      const y = cy + (uy * r.height) / 2 - origin.top - size / 2;
      const mid = `translate(${ux * reach * 0.75}px, ${uy * reach * 0.75}px)`;
      const end = `translate(${ux * reach}px, ${uy * reach + fall}px) scale(.4)`;
      add(
        `left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;` +
          "background:radial-gradient(circle at 35% 35%, rgb(255 255 255 / .95), rgb(255 255 255 / .35) 65%, rgb(255 255 255 / .1))",
        [
          { opacity: 1, transform: "translate(0, 0)", easing: "cubic-bezier(.1,.8,.3,1)" },
          { opacity: 0.9, transform: mid, offset: 0.35, easing: "cubic-bezier(.4,0,.8,.6)" },
          { opacity: 0, transform: end },
        ],
        { duration: 520 + Math.random() * 260 },
      );
    }
  }

  #frame(now) {
    requestAnimationFrame((t) => this.#frame(t));
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;

    let animating = false;
    if (!this.anchor) {
      if (!this.reducedMotion) {
        // Slow moves don't stretch: a scale just off 1 makes the browser re-render the
        // filtered layer at that scale, and the refraction pops
        const vx = Math.max(Math.abs(this.x.velocity) - 150, 0);
        const vy = Math.max(Math.abs(this.y.velocity) - 150, 0);
        this.stretchX.target = 1 + Math.min(vx / 5000, 0.22) - Math.min(vy / 9000, 0.1);
        this.stretchY.target = 1 + Math.min(vy / 5000, 0.22) - Math.min(vx / 9000, 0.1);
      }
      animating = this.springs.some((s) => !s.settled);
      // Settled springs land exactly on target, so the lens rests at scale 1, not 1.006
      for (const s of this.springs) {
        s.step(dt);
        if (s.settled) s.snap(s.target);
      }
      if (this.pop) {
        this.#popFrame(now);
        animating = true;
      }
    }

    if (this.button && (!this.hovered.settled || !this.pressed.settled)) {
      for (const s of [this.hovered, this.pressed]) {
        if (this.reducedMotion) s.snap(s.target);
        else s.step(dt);
      }
      this.#applyButton();
    }

    const sync = this.copyDirty && now - this.syncedAt >= this.throttle;
    const changed = sync || this.shapeDirty || this.rectDirty;
    if (sync) {
      this.#syncCopy();
      this.syncedAt = now;
    } else if (this.rectDirty) {
      this.sourceRect = this.source.getBoundingClientRect();
      this.containerRect = this.container?.getBoundingClientRect();
    }
    this.rectDirty = false;
    // An anchor can measure zero before it's laid out; wait until it has a size
    if (this.shapeDirty && this.params.width >= 1 && this.params.height >= 1) this.#buildShape();
    if (!this.inner) return;
    if (animating || changed || this.placeDirty) this.#place();
    this.placeDirty = animating;
  }
}
