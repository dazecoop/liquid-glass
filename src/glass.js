// Liquid glass over live HTML. The glass holds a copy of the source element, lined up with
// the original, and bends it with an SVG filter. Plain `filter: url()` on an element works in
// Chrome, Firefox and Safari, unlike `backdrop-filter: url()`, which is Chrome only.
//
// Two modes:
// - A lens that follows moveTo(), floating above the page.
// - Glass anchored to an element ({ anchor }), filling it as its background, with the
//   element's own content on top. Its copy leaves the anchor out, so nothing is doubled.
//
// Safari quirks this works around:
// - It drops an SVG filter entirely when the filtered content has GPU-composited layers, so
//   the copy loses backdrop-filter, will-change and animations.
// - It scales transformed content inside an SVG filter wrongly on retina screens, so the
//   copy is moved with left/top and magnification is baked into the displacement map.
//
// Frost is a CSS blur() around the SVG filter rather than feGaussianBlur inside it, which
// keeps it on the GPU in Firefox.

const SVG_NS = "http://www.w3.org/2000/svg";
const LIGHT = [-0.55, -0.83]; // top-left, y down
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
  constructor(source, { anchor = null, ...params } = {}) {
    this.source = source;
    this.anchor = anchor;
    this.params = {
      width: 280,
      height: 180,
      radius: 64,
      refraction: 40,
      frost: 2,
      chroma: 0.4,
      zoom: 1.08,
      tint: "",
      rim: 1,
      ...params,
    };

    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.x = new Spring(innerWidth / 2);
    this.y = new Spring(innerHeight / 2);
    this.scale = new Spring(1, { stiffness: 320, damping: 18 });
    this.stretchX = new Spring(1, { stiffness: 180, damping: 14 });
    this.stretchY = new Spring(1, { stiffness: 180, damping: 14 });
    this.springs = [this.x, this.y, this.scale, this.stretchX, this.stretchY];
    this.scrolled = new Set();

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
      this.el.style.cssText +=
        ";position:fixed;left:0;top:0;z-index:2147483000;will-change:transform;opacity:0;transition:opacity .3s";
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
    (this.anchor ?? document.body).prepend(this.el);

    if (this.anchor) {
      new ResizeObserver(() => {
        this.set({
          width: this.anchor.offsetWidth,
          height: this.anchor.offsetHeight,
          radius: parseFloat(getComputedStyle(this.anchor).borderTopLeftRadius) || 0,
        });
      }).observe(this.anchor);
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

    // Glass inside the copy keeps its own copy, but no deeper, so copies can't nest forever
    for (const glass of copy.querySelectorAll("[data-glass]")) {
      for (const inner of glass.querySelectorAll("[data-glass]")) inner.remove();
    }

    copy.removeAttribute("id");
    for (const el of copy.querySelectorAll("[id]")) el.removeAttribute("id");

    const rect = this.source.getBoundingClientRect();
    this.sourceRect = rect;
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
    const { width, height, radius, refraction, frost, chroma, zoom, tint, rim: rimStrength } = this.params;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const hw = width / 2;
    const hh = height / 2;
    const r = Math.min(radius, hw, hh);
    const bevel = Math.min(Math.max(r * 0.55, 20), hw, hh);
    const sdf = (x, y) => sdRoundBox(x, y, hw, hh, r);
    const normal = (px, py, step) => {
      const nx = sdf(px + step, py) - sdf(px - step, py);
      const ny = sdf(px, py + step) - sdf(px, py - step);
      const len = Math.hypot(nx, ny) || 1;
      return [nx / len, ny / len];
    };

    // The blur reaches past the lens edge, so the filtered area overhangs it by `pad`
    const pad = Math.ceil(frost * 1.5);
    this.pad = pad;

    // Displacement map: the same zoom and circular-bevel profile as the original shader,
    // encoded around 0.5. Only the rim needs normals; the middle is just the zoom.
    const pull = 1 - 1 / zoom;
    const scale = ((Math.max(hw, hh) + pad) * Math.abs(pull) + refraction) * 2 + 1;
    const map = document.createElement("canvas");
    map.width = Math.ceil(width + pad * 2);
    map.height = Math.ceil(height + pad * 2);
    const mctx = map.getContext("2d");
    const md = mctx.createImageData(map.width, map.height);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const px = x + 0.5 - hw - pad;
        const py = y + 0.5 - hh - pad;
        let ox = px * pull;
        let oy = py * pull;
        const d = sdf(px, py);
        if (d < 0 && d > -bevel && refraction > 0) {
          const rim = 1 + d / bevel;
          const bend = (1 - Math.sqrt(1 - rim * rim)) * refraction;
          const [nx, ny] = normal(px, py, 1);
          ox += nx * bend;
          oy += ny * bend;
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
        }
        const i = (y * rim.width + x) * 4;
        rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = 255;
        rd.data[i + 3] = Math.min(a, 1) * 255;
      }
    }
    rctx.putImageData(rd, 0, 0);
    rim.style.background = tint;

    // One displacement pass, or one per colour channel for dispersion
    const href = map.toDataURL();
    const c = chroma * 0.35;
    const displace = (k, result) =>
      `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale * k}" xChannelSelector="R" yChannelSelector="G" result="${result}" />`;
    this.filter.innerHTML =
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

    Object.assign(this.frost.style, {
      left: `${-pad}px`,
      top: `${-pad}px`,
      width: `${width + pad * 2}px`,
      height: `${height + pad * 2}px`,
      filter: frost > 0 ? `blur(${frost / 2}px)` : "none",
    });
    if (!this.anchor) {
      this.el.style.width = `${width}px`;
      this.el.style.height = `${height}px`;
      this.el.style.borderRadius = `${r}px`;
    }
    this.shapeDirty = false;
  }

  // Keep the copy lined up with the original under the glass. Squash and press scale the whole
  // lens, copy included, since Safari can't take a transform on the copy itself.
  #place() {
    const { width, height } = this.params;
    const source = this.sourceRect;
    let left, top;

    if (this.anchor) {
      ({ left, top } = this.anchor.getBoundingClientRect());
    } else {
      const s = this.scale.value;
      left = this.x.value - width / 2;
      top = this.y.value - height / 2;
      this.el.style.transform =
        `translate(${left}px, ${top}px) scale(${s * this.stretchX.value}, ${s * this.stretchY.value})`;
    }

    this.copyHost.style.left = `${this.pad + source.left - left}px`;
    this.copyHost.style.top = `${this.pad + source.top - top}px`;
  }

  // Moves the lens to a point in viewport (client) coordinates
  moveTo(x, y) {
    if (this.reducedMotion) {
      this.x.snap(x);
      this.y.snap(y);
    } else {
      this.x.target = x;
      this.y.target = y;
    }
    this.el.style.opacity = "1";
  }

  press(down) {
    this.scale.target = down ? 1.12 : 1;
    if (this.reducedMotion) this.scale.snap(this.scale.target);
  }

  set(params) {
    Object.assign(this.params, params);
    this.shapeDirty = true;
  }

  show(visible) {
    this.el.style.opacity = visible ? "1" : "0";
  }

  #frame(now) {
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;

    let animating = false;
    if (!this.anchor) {
      if (!this.reducedMotion) {
        const vx = Math.abs(this.x.velocity);
        const vy = Math.abs(this.y.velocity);
        this.stretchX.target = 1 + Math.min(vx / 5000, 0.22) - Math.min(vy / 9000, 0.1);
        this.stretchY.target = 1 + Math.min(vy / 5000, 0.22) - Math.min(vx / 9000, 0.1);
      }
      animating = this.springs.some((s) => !s.settled);
      for (const s of this.springs) s.step(dt);
    }

    const changed = this.copyDirty || this.shapeDirty || this.rectDirty;
    if (this.copyDirty) this.#syncCopy();
    else if (this.rectDirty) this.sourceRect = this.source.getBoundingClientRect();
    this.rectDirty = false;
    if (this.shapeDirty) this.#buildShape();
    if (animating || changed || this.placeDirty) this.#place();
    this.placeDirty = animating;
    requestAnimationFrame((t) => this.#frame(t));
  }
}
