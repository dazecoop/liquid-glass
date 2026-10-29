// UI components on the lens, after iOS 26: a switch (plain, or with a label each side), a
// floating tab bar and a glass button, each in a light and a dark look. Their springs and
// sizes were measured off UIKit (frame by frame on the iOS 26.5 simulator, and from iPhone
// screenshots); their looks were tuned side by side with iOS.
import { LiquidGlass } from "./glass.js";

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// UIKit's springs: the lens lifts critically damped, moves on a 0.405s / 0.85 spring,
// trails a dragged finger on a stiffer 0.26s / 0.75 one, and after a tap hangs 0.22s
// before it sets down
const LIFT = { stiffness: 632, damping: 50.3 };
const MOVE = { stiffness: 241, damping: 26.4 };
const TRAIL = { stiffness: 576, damping: 36 };
const HANG = 220;

const springs = (lens, move = MOVE) => {
  lens.scale.stiffness = LIFT.stiffness;
  lens.scale.damping = LIFT.damping;
  lens.x.stiffness = lens.y.stiffness = move.stiffness;
  lens.x.damping = lens.y.damping = move.damping;
};
// Arrived: within half a pixel and nearly still (a spring's last fraction of a pixel takes
// far longer than the eye can see)
const arrived = (lens) => Math.abs(lens.x.value - lens.x.target) <= 0.5 && Math.abs(lens.x.velocity) <= 30;

// Clear glass, as UIKit's pressed selection: a thin hard rim, a little dispersion and zoom.
// The dark look's highlight is dimmer and the glass a touch brighter, as UIKit's dark
// appearance is.
const CLEAR = { frost: 1, fresnel: 0.15, saturation: 0, tint: "", rim: 0.45, body: 0, falloff: 0, lightAngle: -123.5 };
export const LOOKS = {
  switch: {
    dark: { ...CLEAR, refraction: 25, bevel: 6, chroma: 0.21, zoom: 1.12, specular: 0.25, brightness: 0.03 },
    light: { ...CLEAR, refraction: 20, bevel: 5, chroma: 0.12, zoom: 1.1, specular: 0.55, brightness: 0 },
  },
  // UIKit's rim profile: the bend hardest at the very edge, easing off by e every 4.5px
  tabs: {
    dark: { ...CLEAR, refraction: 28, bevel: 5, falloff: 4.5, chroma: 0.1, zoom: 1.1, specular: 0.25, brightness: 0.03, lightAngle: -140 },
    light: { ...CLEAR, refraction: 28, bevel: 5, falloff: 4.5, chroma: 0.1, zoom: 1.1, specular: 0.55, brightness: 0, lightAngle: -140 },
  },
  // A little milk and a brighter rim, so a resting button reads on a flat background
  button: {
    dark: { ...CLEAR, refraction: 28, bevel: 5, chroma: 0.12, zoom: 1.08, specular: 0.25, brightness: 0.03, rim: 0.6, body: 0.12 },
    light: { ...CLEAR, refraction: 28, bevel: 5, chroma: 0.12, zoom: 1.08, specular: 0.55, brightness: 0, rim: 0.6, body: 0.12 },
  },
};
const themeOf = (el) => (el.closest("[data-theme]")?.dataset.theme === "light" ? "light" : "dark");

// A soft white glow under the finger while pressed, inside the lens (UIKit's LittleGlowView)
function addGlow(lens) {
  const glow = document.createElement("span");
  glow.className = "lg-glow";
  lens.el.append(glow);
  // In the lens's own unscaled pixels, so it stays under the finger as the lens swells
  return (e) => {
    const r = lens.el.getBoundingClientRect();
    const k = r.width / lens.el.offsetWidth;
    glow.style.left = `${(e.clientX - r.left) / k}px`;
    glow.style.top = `${(e.clientY - r.top) / k}px`;
  };
}

// ---------- Switch ----------
// A solid thumb at rest. Hovered, pressed, dragged or sliding, it dissolves into a clear
// glass lens 1.55× its size (as measured off an iPhone), and sets back down once it stops.
// Pressed, the lens swells a little more, with a glow under the finger. A click anywhere
// flips it; a drag lands on the side it's heading for.
//
// The glass refracts .refract, a bar in the track's colour whose rounded ends sit evenly
// inside the lens at either resting place: the glass rings the end with an even band of the
// surface round it, and the colour runs on into the track behind, as iOS's does.
//
// Markup: the root holds .refract, .thumb and two [data-opt] (a plain switch's can be empty
// spans). A root with role="switch" carries aria-checked itself; otherwise each option does.
export class GlassSwitch {
  constructor(root, { grow = 1.55, press = 1.08, lean = 4, look = LOOKS.switch[themeOf(root)] } = {}) {
    this.root = root;
    this.grow = grow;
    this.press = press;
    this.lean = lean;
    this.look = look;
    this.thumb = root.querySelector(":scope > .thumb");
    this.bar = root.querySelector(":scope > .refract");
    this.options = [...root.querySelectorAll(":scope > [data-opt]")];
    this.isSwitch = root.getAttribute("role") === "switch";
    this.value = this.isSwitch
      ? Number(root.getAttribute("aria-checked") === "true")
      : Math.max(0, this.options.findIndex((o) => o.getAttribute("aria-checked") === "true"));
    this.up = false;
    this.hovered = false;
    this.pressed = false;
    this.drag = null;
    this.frame = 0;

    this.lens = new LiquidGlass(this.bar, { container: root, ...look });
    springs(this.lens);
    this.glowAt = addGlow(this.lens);
    root.classList.add("glassy");
    this.size();
    this.lens.scale.snap(1 / (grow * press));
    this.put(this.centre(this.value));
    this.#events();
  }

  centre(i) {
    const o = this.options[i];
    return o.offsetLeft + o.offsetWidth / 2;
  }

  // The thumb's centre, in the root's padding box; --p is how far across, for the colour
  put(x) {
    this.at = x;
    this.thumb.style.translate = `${x - this.thumb.offsetLeft - this.thumb.offsetWidth / 2}px`;
    this.root.style.setProperty("--p", clamp((x - this.centre(0)) / (this.centre(1) - this.centre(0)), 0, 1));
  }

  // The lens is built at its pressed size and scaled down from there. It reaches past the
  // thumb's outer end by its width × grow, as iOS's does, but past its inner end only as
  // far as above and below, so a wide thumb's lens doesn't spill over the other label: it
  // sits `shift` px off the thumb's centre, towards the outside. The bar's ends are cut
  // for the lifted (unpressed) size, with the gaps measured magnified, as the glass shows
  // them.
  size() {
    const tw = this.thumb.offsetWidth;
    const th = this.thumb.offsetHeight;
    const h = th * this.grow;
    const wide = tw * this.grow;
    const w = Math.min(wide, (wide + tw + h - th) / 2);
    this.shift = (wide - w) / 2;
    this.lens.set({ width: w * this.press, height: h * this.press, radius: (h * this.press) / 2 });
    const gap = h - this.bar.offsetHeight * this.look.zoom;
    const reach = (w - gap) / 2 / this.look.zoom;
    const left = this.lensAt(this.centre(0)) - reach;
    this.bar.style.left = `${left}px`;
    this.bar.style.width = `${this.lensAt(this.centre(1)) + reach - left}px`;
  }

  // Between the lens's centre and the thumb's: shifted outward at either end, in between
  // in proportion
  lensAt(x) {
    const c0 = this.centre(0);
    const d = this.centre(1) - c0;
    return x + this.shift * (2 * clamp((x - c0) / d, 0, 1) - 1);
  }

  thumbAt(x) {
    const c0 = this.centre(0);
    const k = (2 * this.shift) / (this.centre(1) - c0);
    return clamp((x + this.shift + k * c0) / (1 + k), c0, this.centre(1));
  }

  select(i) {
    if (i === this.value) return;
    this.value = i;
    if (this.isSwitch) this.root.setAttribute("aria-checked", String(i === 1));
    else this.options.forEach((o, j) => o.setAttribute("aria-checked", String(i === j)));
    this.lift();
    this.lens.x.target = this.lensAt(this.centre(i));
    this.root.dispatchEvent(new CustomEvent("change", { detail: { value: i }, bubbles: true }));
  }

  // Dissolve the thumb into glass; the thumb follows it until it's been still a moment
  lift() {
    const lens = this.lens;
    if (!this.up) {
      this.up = true;
      lens.x.snap(this.lensAt(this.at));
      lens.y.snap(this.thumb.offsetTop + this.thumb.offsetHeight / 2);
      lens.show(true);
      lens.el.style.transition = "opacity 0.18s";
      this.root.classList.add("lifted");
    }
    lens.scale.target = this.pressed ? 1 : 1 / this.press;
    cancelAnimationFrame(this.frame);
    let still = 0;
    const tick = (now) => {
      this.put(this.thumbAt(lens.x.value));
      if (this.drag || this.hovered || this.pressed || !arrived(lens)) still = 0;
      else if (!still) still = now;
      if (still && now - still > HANG) this.drop();
      else this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  // Shrink back to the thumb as it fades back in over the glass
  drop() {
    if (!this.up) return;
    this.up = false;
    this.lens.scale.target = 1 / (this.grow * this.press);
    this.lens.show(false);
    this.lens.el.style.transition = "opacity 0.3s 0.08s";
    this.root.classList.remove("lifted");
  }

  setPressed(on, e) {
    this.pressed = on;
    this.root.classList.toggle("pressing", on);
    if (on) this.glowAt(e);
    if (on || this.up) this.lift();
  }

  #events() {
    const root = this.root;
    // A drag has already chosen, so the click that ends it is ignored
    let dragged = false;
    root.addEventListener("click", () => {
      if (dragged) dragged = false;
      else this.select(1 - this.value);
    });
    root.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      this.hovered = true;
      this.lift();
    });
    root.addEventListener("pointerleave", () => {
      this.hovered = false;
      if (!this.drag) this.lens.x.target = this.lensAt(this.centre(this.value));
      // Left before it was dragged: no pointerup will come here
      else if (!this.drag.moved) {
        this.drag = null;
        this.setPressed(false);
      }
    });
    root.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.drag = { id: e.pointerId, x: e.clientX, from: this.at, moved: false };
      this.setPressed(true, e);
    });
    root.addEventListener("pointermove", (e) => {
      const d = this.drag;
      const lens = this.lens;
      if (this.pressed) this.glowAt(e);
      // Hovering, the lens leans a few pixels towards the pointer
      if (!d) {
        if (!this.hovered) return;
        const home = this.centre(this.value);
        const x = e.clientX - root.getBoundingClientRect().left - root.clientLeft;
        const half = this.options[this.value].offsetWidth / 2;
        lens.x.target = this.lensAt(home) + clamp((x - home) / half, -1, 1) * this.lean;
        return;
      }
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 4) {
        d.moved = true;
        root.setPointerCapture(d.id);
      }
      if (d.moved) lens.x.target = this.lensAt(clamp(d.from + dx, this.centre(0), this.centre(1)));
    });
    root.addEventListener("pointerup", () => {
      const d = this.drag;
      this.drag = null;
      this.setPressed(false);
      if (!d?.moved) return;
      dragged = true;
      setTimeout(() => (dragged = false));
      // Land on the side it's heading for
      const lens = this.lens;
      const ahead = this.thumbAt(lens.x.value + lens.x.velocity * 0.12);
      const side = ahead > (this.centre(0) + this.centre(1)) / 2 ? 1 : 0;
      if (side === this.value) {
        this.lift();
        lens.x.target = this.lensAt(this.centre(side));
      } else this.select(side);
    });
    root.addEventListener("pointercancel", () => {
      this.drag = null;
      this.setPressed(false);
      this.lens.x.target = this.lensAt(this.centre(this.value));
    });
    addEventListener("resize", () => {
      this.size();
      if (!this.up) this.put(this.centre(this.value));
    });
  }
}

// ---------- Tab bar ----------
// iOS 26's floating tab bar. Pressing lifts a clear lens over the pressed tab, centred on
// it, and bulges it a little; dragging past a few pixels carries it with the finger on a
// stiffer trailing spring; releasing picks the tab under it, where it lands, hangs and sets
// down. The bar swells 3.55% while pressed, with a glow under the finger. With a mouse,
// hovering lifts the lens over the tab under the pointer too. At rest a pill sits behind
// the current tab.
//
// Markup: the root holds a .lg-pill, a .lg-glowbox with a .lg-glow inside, and the tabs
// (buttons or links). Picking a tab clicks it, and the bar fires "change".
export class GlassTabBar {
  constructor(root, { grow = 1.3, press = 1.1, look = LOOKS.tabs[themeOf(root)] } = {}) {
    this.root = root;
    this.grow = grow;
    this.press = press;
    this.tabs = [...root.querySelectorAll(":scope > a, :scope > button")];
    this.pill = root.querySelector(":scope > .lg-pill");
    this.glow = root.querySelector(".lg-glow");
    this.pressedId = null;
    this.frame = 0;
    this.lens = new LiquidGlass(root, { container: root, ...look });
    springs(this.lens);
    this.placePill();
    this.#events();
  }

  get current() {
    return this.tabs.find((t) => t.hasAttribute("aria-current")) ?? null;
  }

  centre(t) {
    return t.offsetLeft + t.offsetWidth / 2;
  }

  choose(tab) {
    if (tab === this.current) return;
    this.tabs.forEach((t) => t.removeAttribute("aria-current"));
    tab.setAttribute("aria-current", "page");
    this.placePill();
    this.root.dispatchEvent(new CustomEvent("change", { detail: { tab }, bubbles: true }));
  }

  placePill() {
    const t = this.current;
    this.pill.hidden = !t;
    if (!t) return;
    Object.assign(this.pill.style, {
      left: `${t.offsetLeft}px`,
      top: `${t.offsetTop}px`,
      width: `${t.offsetWidth}px`,
      height: `${t.offsetHeight}px`,
    });
  }

  // Lift the lens over a tab: swelling in there if it's down, sliding there if it's up.
  // It outgrows the tab by 8px a side, and bulges `press` more while pressed (it's built
  // at that size and scaled down from there).
  lift(tab) {
    const lens = this.lens;
    cancelAnimationFrame(this.frame);
    const h = (this.root.offsetHeight + 8) * this.press;
    lens.set({ width: (tab.offsetWidth + 16) * this.press, height: h, radius: h / 2 });
    const x = this.centre(tab);
    const y = tab.offsetTop + tab.offsetHeight / 2;
    if (!lens.visible) {
      lens.x.snap(x);
      lens.y.snap(y);
      lens.scale.snap(1 / (this.grow * this.press));
      lens.show(true);
      lens.el.style.transition = "opacity 0.18s";
      this.root.classList.add("lensing");
    }
    this.bulge();
    lens.x.target = x;
    lens.y.target = y;
  }

  bulge() {
    this.lens.scale.target = this.pressedId === null ? 1 / this.press : 1;
  }

  drop() {
    this.root.classList.remove("lensing");
    this.lens.scale.target = 1 / (this.grow * this.press);
    this.lens.show(false);
    this.lens.el.style.transition = "opacity 0.3s 0.08s";
  }

  // Once the lens has arrived, hang a moment, then set it down
  settle(hang) {
    const lens = this.lens;
    cancelAnimationFrame(this.frame);
    let still = 0;
    const tick = (now) => {
      if (!arrived(lens)) still = 0;
      else if (!still) still = now;
      if (still && now - still > hang) this.drop();
      else this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  #events() {
    const root = this.root;
    const local = (e) => e.clientX - root.getBoundingClientRect().left - root.clientLeft;
    const clampX = (x) => clamp(x, this.centre(this.tabs[0]), this.centre(this.tabs.at(-1)));
    const tabAt = (x) =>
      this.tabs.reduce((a, b) => (Math.abs(this.centre(b) - x) < Math.abs(this.centre(a) - x) ? b : a));
    const glowAt = (e) => {
      const r = root.getBoundingClientRect();
      this.glow.style.left = `${e.clientX - r.left}px`;
      this.glow.style.top = `${e.clientY - r.top}px`;
    };

    this.tabs.forEach((t) => t.addEventListener("click", () => this.choose(t)));
    root.addEventListener("pointerover", (e) => {
      const tab = e.target.closest("a, button");
      if (e.pointerType === "mouse" && this.pressedId === null && tab) this.lift(tab);
    });
    root.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && this.pressedId === null) this.settle(0);
    });
    // The press: where it started, over which tab, and whether it has become a drag
    let press = null;
    root.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      // The tab's own click is replaced by the release, which can land elsewhere
      e.preventDefault();
      root.setPointerCapture(e.pointerId);
      this.pressedId = e.pointerId;
      // Up over the pressed tab, centred on it wherever in it the press landed
      const tab = e.target.closest("a, button") ?? tabAt(local(e));
      press = { x: e.clientX, tab, dragging: false };
      this.lift(tab);
      springs(this.lens, TRAIL);
      glowAt(e);
      root.classList.add("pressing");
    });
    root.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.pressedId) return;
      glowAt(e);
      // Past a few pixels it's a drag: the lens moves with the finger, from where it was
      const dx = e.clientX - press.x;
      if (!press.dragging && Math.abs(dx) > 6) press.dragging = true;
      if (press.dragging) this.lens.x.target = clampX(this.centre(press.tab) + dx);
    });
    const release = (e, pick) => {
      if (e.pointerId !== this.pressedId) return;
      this.pressedId = null;
      root.classList.remove("pressing");
      springs(this.lens);
      this.bulge();
      if (!pick) return this.settle(0);
      const tab = press.dragging ? tabAt(this.lens.x.target) : press.tab;
      this.lens.x.target = this.centre(tab);
      tab.click();
      // Released with a mouse still over the bar: the lens stays up, hovering
      if (!(e.pointerType === "mouse" && root.matches(":hover"))) this.settle(HANG);
    };
    root.addEventListener("pointerup", (e) => release(e, true));
    root.addEventListener("pointercancel", (e) => release(e, false));
    addEventListener("resize", () => this.placePill());
  }
}

// ---------- Button ----------
// iOS 26's glass button: at rest a clear lens over whatever is behind it. Hovered, it
// grows a little and lights up in its tint (--tint), its content growing with it, a faint
// glow following the pointer; pressed it swells a little more, brighter, the glow
// stronger; then it shrinks back to clear glass.
//
// The lens lives in `container` (by default the button's parent) and refracts `source`, an
// element in there behind the button (by default its [data-glass-source]).
export class GlassButton {
  constructor(
    button,
    {
      container = button.parentElement,
      source = container.querySelector(":scope > [data-glass-source]"),
      grow = 1.1,
      press = 1.08,
      lit = 0.95,
      hang = 120,
      look = LOOKS.button[themeOf(button)],
    } = {},
  ) {
    this.btn = button;
    this.container = container;
    this.grow = grow;
    this.press = press;
    this.hang = hang;
    this.hovered = false;
    this.pressed = false;
    this.up = false;
    this.frame = 0;
    button.style.setProperty("--lit-max", lit);
    // The tint and the glow, clipped to the button's shape, behind its content
    const clip = document.createElement("span");
    clip.className = "lg-clip";
    clip.setAttribute("aria-hidden", "true");
    const glow = document.createElement("span");
    glow.className = "lg-glow";
    clip.append(glow);
    button.prepend(clip);

    this.lens = new LiquidGlass(source, { container, ...look });
    springs(this.lens);
    this.size();
    this.lens.scale.snap(1 / this.full);
    this.lens.show(true);
    this.track();

    const glowAt = (e) => {
      const r = button.getBoundingClientRect();
      const k = r.width / button.offsetWidth;
      glow.style.left = `${(e.clientX - r.left) / k}px`;
      glow.style.top = `${(e.clientY - r.top) / k}px`;
    };
    // Hovered, a fainter glow follows the pointer
    button.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      this.hovered = true;
      glowAt(e);
      button.classList.add("hovering");
      this.lift();
    });
    button.addEventListener("pointerleave", () => {
      this.hovered = false;
      button.classList.remove("hovering");
      this.pressed = false;
      this.lift();
      this.settle();
    });
    button.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.pressed = true;
      glowAt(e);
      this.lift();
    });
    button.addEventListener("pointermove", (e) => (this.pressed || this.hovered) && glowAt(e));
    const up = () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.lift();
      this.settle();
    };
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    // Keyboard: lit while focused, pressed while Space or Enter is down
    button.addEventListener("focus", () => button.matches(":focus-visible") && this.lift());
    button.addEventListener("blur", () => this.settle(0));
    button.addEventListener("keydown", (e) => {
      if (e.key !== " " && e.key !== "Enter") return;
      this.pressed = true;
      this.lift();
    });
    button.addEventListener("keyup", () => {
      this.pressed = false;
      this.lift();
    });
    addEventListener("resize", () => this.size());
  }

  // The lens is built at its pressed size; rest, hover and press scale it down from there
  get full() {
    return this.grow * this.press;
  }

  size() {
    const b = this.btn.getBoundingClientRect();
    const c = this.container.getBoundingClientRect();
    // At rest the button's own size, whatever scale it's showing now
    const w = this.btn.offsetWidth * this.full;
    const h = this.btn.offsetHeight * this.full;
    this.lens.set({ width: w, height: h, radius: h / 2 });
    this.lens.x.snap(b.left + b.width / 2 - c.left - this.container.clientLeft);
    this.lens.y.snap(b.top + b.height / 2 - c.top - this.container.clientTop);
  }

  lift() {
    cancelAnimationFrame(this.settling);
    this.up = true;
    this.lens.scale.target = this.pressed ? 1 : 1 / this.press;
    this.btn.classList.toggle("pressing", this.pressed);
    this.track();
  }

  // Once nothing holds it up, hang a moment, then shrink back to clear glass
  settle(hang = this.hang) {
    if (!this.up || this.hovered || this.pressed || this.btn.matches(":focus-visible")) return;
    cancelAnimationFrame(this.settling);
    const start = performance.now();
    const tick = (now) => {
      if (this.hovered || this.pressed) return;
      if (now - start < hang) this.settling = requestAnimationFrame(tick);
      else {
        this.up = false;
        this.lens.scale.target = 1 / this.full;
        this.track();
      }
    };
    this.settling = requestAnimationFrame(tick);
  }

  // While the lens grows or shrinks, the tint and content follow its size
  track() {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      const s = this.lens.scale.value * this.full;
      this.btn.style.setProperty("--s", s.toFixed(4));
      this.btn.style.setProperty("--lit", clamp((s - 1) / (this.grow - 1 || 1), 0, 1).toFixed(4));
      if (!this.lens.scale.settled) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
}

// Every component under `root`, from its data attributes
export function initComponents(root = document) {
  root.querySelectorAll("[data-glass-switch]").forEach((el) => new GlassSwitch(el));
  root.querySelectorAll("[data-glass-tabs]").forEach((el) => new GlassTabBar(el));
  root.querySelectorAll("[data-glass-button]").forEach((el) => new GlassButton(el));
}
