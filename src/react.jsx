// React bindings. Each component renders the markup its vanilla class expects, builds the
// class in an effect and destroys it on cleanup, so StrictMode's double mount and unmounts
// leave nothing behind. Nothing touches the DOM during render, so server rendering is safe:
// the glass appears once the page hydrates. (The build marks the file "use client".)
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { LiquidGlass } from "./glass.js";
import { GlassSwitch as Switch, GlassTabBar as TabBar, GlassButton as Button } from "./components.js";

export { LiquidGlass };

const resolve = (target) => (typeof target === "function" ? target() : (target?.current ?? target ?? null));
const cx = (...names) => names.filter(Boolean).join(" ");

// One ref for our own use, also passed on to the caller's
function useForwarded(ref) {
  const own = useRef(null);
  useImperativeHandle(ref, () => own.current, []);
  return own;
}

// A change the component made itself (a prop updating the class) shouldn't call onChange back
function useQuiet() {
  const quiet = useRef(false);
  return [quiet, (fn) => {
    quiet.current = true;
    try {
      fn();
    } finally {
      quiet.current = false;
    }
  }];
}

// Controlled when `value` is given, otherwise it keeps its own, starting at `initial`
function useValue(value, initial) {
  const [own, setOwn] = useState(initial);
  return [value === undefined ? own : value, setOwn];
}

/**
 * Builds a LiquidGlass over `source` (a ref, an element, or a function returning one) once
 * it's mounted, and destroys it on unmount. Changes to the glass parameters are applied with
 * set(); `anchor`, `container`, `button` and `throttle` rebuild it. Returns the instance, or
 * null until it exists.
 */
export function useLiquidGlass(source, { anchor, container, button = false, throttle = 0, ...params } = {}) {
  const [glass, setGlass] = useState(null);
  const latest = useRef(params);
  latest.current = params;

  useEffect(() => {
    const el = resolve(source);
    if (!el) return;
    const g = new LiquidGlass(el, {
      anchor: resolve(anchor),
      container: resolve(container),
      button,
      throttle,
      ...latest.current,
    });
    setGlass(g);
    return () => {
      g.destroy();
      setGlass(null);
    };
  }, [source, anchor, container, button, throttle]);

  const key = JSON.stringify(params);
  const applied = useRef(null);
  useEffect(() => {
    if (!glass) return;
    // The first parameters went in with the constructor
    if (applied.current === glass) glass.set(latest.current);
    applied.current = glass;
  }, [glass, key]);

  return glass;
}

/**
 * A lens that follows the pointer over its children, refracting them. It lives inside the
 * scene, clipped to it, and fades out when the pointer leaves.
 */
export const GlassScene = forwardRef(function GlassScene(
  { as: Tag = "div", glass: params, onPointerMove, onPointerDown, onPointerUp, onPointerLeave, children, ...rest },
  ref,
) {
  const el = useForwarded(ref);
  const lens = useLiquidGlass(el, { container: el, ...params });
  return (
    <Tag
      ref={el}
      {...rest}
      onPointerMove={(e) => {
        lens?.moveTo(e.clientX, e.clientY);
        onPointerMove?.(e);
      }}
      onPointerDown={(e) => {
        lens?.moveTo(e.clientX, e.clientY);
        lens?.press(true);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        lens?.press(false);
        onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        lens?.press(false);
        lens?.show(false);
        onPointerLeave?.(e);
      }}
    >
      {children}
    </Tag>
  );
});

/**
 * An element with glass as its background, refracting `source` (a ref to something behind
 * it; its parent by default). With `button`, the glass brightens on hover and flattens on
 * press.
 */
export const GlassPanel = forwardRef(function GlassPanel(
  { as: Tag = "div", source, button = false, glass: params, children, ...rest },
  ref,
) {
  const el = useForwarded(ref);
  const from = useCallback(() => resolve(source) ?? el.current?.parentElement, [source, el]);
  useLiquidGlass(from, { anchor: el, button, ...params });
  return (
    <Tag ref={el} {...rest}>
      {children}
    </Tag>
  );
});

/** iOS's switch: a solid thumb that dissolves into glass while it's touched or moving. */
export const GlassSwitch = forwardRef(function GlassSwitch(
  { checked, defaultChecked = false, onChange, look, className, ...rest },
  ref,
) {
  const el = useForwarded(ref);
  const [on, setOn] = useValue(checked, defaultChecked);
  const inst = useRef(null);
  const [quiet, silently] = useQuiet();
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const root = el.current;
    const s = (inst.current = new Switch(root, look && { look }));
    const changed = (e) => {
      if (e.target !== root || quiet.current) return;
      setOn(e.detail.value === 1);
      latest.current?.(e.detail.value === 1);
    };
    root.addEventListener("change", changed);
    return () => {
      root.removeEventListener("change", changed);
      s.destroy();
      inst.current = null;
    };
  }, [JSON.stringify(look)]);

  useEffect(() => {
    if (inst.current) silently(() => inst.current.select(on ? 1 : 0));
  }, [on]);

  return (
    <button ref={el} type="button" role="switch" aria-checked={on} className={cx("lg-switch", className)} {...rest}>
      <span className="refract" aria-hidden="true" />
      <span className="thumb" aria-hidden="true" />
      <span data-opt="" />
      <span data-opt="" />
    </button>
  );
});

/**
 * The switch with a label each side, choosing one of two `options` (strings, or
 * { value, label }). `value` is the chosen option's value.
 */
export const GlassSegment = forwardRef(function GlassSegment(
  { options, value, defaultValue, onChange, look, className, ...rest },
  ref,
) {
  const el = useForwarded(ref);
  const items = options.map((o) => (typeof o === "object" ? o : { value: o, label: o }));
  const [current, setCurrent] = useValue(value, defaultValue ?? items[0].value);
  const index = Math.max(0, items.findIndex((o) => o.value === current));
  const inst = useRef(null);
  const [quiet, silently] = useQuiet();
  const latest = useRef({ onChange, items });
  latest.current = { onChange, items };

  useEffect(() => {
    const root = el.current;
    const s = (inst.current = new Switch(root, look && { look }));
    const changed = (e) => {
      if (e.target !== root || quiet.current) return;
      const next = latest.current.items[e.detail.value].value;
      setCurrent(next);
      latest.current.onChange?.(next);
    };
    root.addEventListener("change", changed);
    return () => {
      root.removeEventListener("change", changed);
      s.destroy();
      inst.current = null;
    };
  }, [JSON.stringify(look)]);

  useEffect(() => {
    if (inst.current) silently(() => inst.current.select(index));
  }, [index]);

  return (
    <div ref={el} role="radiogroup" className={cx("lg-segment", className)} {...rest}>
      <span className="refract" aria-hidden="true" />
      <span className="thumb" aria-hidden="true" />
      {items.slice(0, 2).map((o, i) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={i === index} data-opt="">
          {o.label}
        </button>
      ))}
    </div>
  );
});

/**
 * iOS's floating tab bar. `items` are { value, label, icon?, href? }; one with an href
 * renders a link. Position it yourself, for example fixed to the bottom of the screen.
 */
export const GlassTabBar = forwardRef(function GlassTabBar(
  { items, value, defaultValue, onChange, look, className, ...rest },
  ref,
) {
  const el = useForwarded(ref);
  const [current, setCurrent] = useValue(value, defaultValue ?? items[0]?.value);
  const inst = useRef(null);
  const [quiet, silently] = useQuiet();
  const latest = useRef({ onChange, items });
  latest.current = { onChange, items };
  // The class collects its tabs when it's built, so a different set of tabs rebuilds it
  const keys = items.map((t) => String(t.value)).join("\n");

  useEffect(() => {
    const root = el.current;
    const bar = (inst.current = new TabBar(root, look && { look }));
    const changed = (e) => {
      if (e.target !== root || quiet.current) return;
      const next = latest.current.items[bar.tabs.indexOf(e.detail.tab)]?.value;
      setCurrent(next);
      latest.current.onChange?.(next);
    };
    root.addEventListener("change", changed);
    return () => {
      root.removeEventListener("change", changed);
      bar.destroy();
      inst.current = null;
    };
  }, [keys, JSON.stringify(look)]);

  useEffect(() => {
    const bar = inst.current;
    const tab = bar?.tabs[items.findIndex((t) => t.value === current)];
    if (tab) silently(() => bar.choose(tab));
  }, [current, keys]);

  return (
    <nav ref={el} className={cx("lg-tabs", className)} {...rest}>
      <span className="lg-pill" aria-hidden="true" hidden />
      <span className="lg-glowbox" aria-hidden="true">
        <span className="lg-glow" />
      </span>
      {items.map((t) => {
        const Tab = t.href ? "a" : "button";
        return (
          <Tab
            key={String(t.value)}
            {...(t.href ? { href: t.href } : { type: "button" })}
            aria-current={t.value === current ? "page" : undefined}
          >
            {t.icon}
            {t.label}
          </Tab>
        );
      })}
    </nav>
  );
});

/**
 * iOS's glass button: a clear lens at rest, lighting up in `tint` when hovered or pressed.
 * Its lens lives in the button's parent (which should be positioned) and refracts `source`,
 * a ref to something in there behind the button; by default the parent's
 * [data-glass-source] child.
 */
export const GlassButton = forwardRef(function GlassButton(
  { source, tint, grow, press, lit, hang, look, className, style, children, ...rest },
  ref,
) {
  const el = useForwarded(ref);
  const options = { grow, press, lit, hang, look };
  const key = JSON.stringify(options);

  useEffect(() => {
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
    const from = resolve(source);
    const b = new Button(el.current, from ? { ...given, source: from } : given);
    return () => b.destroy();
  }, [source, key]);

  return (
    <button
      ref={el}
      type="button"
      className={cx("lg-button", className)}
      style={tint ? { "--tint": tint, ...style } : style}
      {...rest}
    >
      <span className="lg-content">{children}</span>
    </button>
  );
});
