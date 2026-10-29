/** Parameters that shape and light the glass. All are optional when passed to set(). */
export interface GlassParams {
  /** Lens width in CSS pixels (anchored glass takes its anchor's). Default 280 */
  width?: number;
  /** Lens height in CSS pixels (anchored glass takes its anchor's). Default 180 */
  height?: number;
  /** Corner radius in CSS pixels (anchored glass takes its anchor's). Default 64 */
  radius?: number;
  /** How far the curved rim reaches in, in CSS pixels. Half the smaller side or more is a full dome. Default 35 */
  bevel?: number;
  /** How far the rim bends the content, in CSS pixels. Default 40 */
  refraction?: number;
  /** Blur radius in CSS pixels. Default 2 */
  frost?: number;
  /** Chromatic dispersion at the rim, 0 to 1. Default 0.4 */
  chroma?: number;
  /** Magnification across the whole lens. Default 1.08 */
  zoom?: number;
  /** Strength of the specular highlight, 0 to 1. Default 0.35 */
  specular?: number;
  /** Strength of the edge glow where the glass turns away, 0 to 1. Default 0.3 */
  fresnel?: number;
  /** Brightness of what's seen through the glass, -0.5 to 0.5. Default 0 */
  brightness?: number;
  /** Saturation of what's seen through the glass, -1 (grey) to 1. Default 0 */
  saturation?: number;
  /** A CSS colour laid over the glass, for legibility. Default "" */
  tint?: string;
  /** Strength of the rim lighting and edge hairline, 0 to 1. Default 1 */
  rim?: number;
  /** Milky body inside the rim, 0 to 1. Default 1 */
  body?: number;
  /** UIKit's rim profile: the bend decays by e every this many px inward. 0 is a circular bevel. Default 0 */
  falloff?: number;
  /** Angle of the light, in degrees */
  lightAngle?: number;
  /** Squash and stretch as the lens moves: 0 off, 1 full. Default 1 */
  stretch?: number;
}

export interface GlassOptions extends GlassParams {
  /** An element to fill as its background, instead of a lens that follows moveTo() */
  anchor?: HTMLElement | null;
  /** An element for the lens to live in, clipped to it and scrolling with it */
  container?: HTMLElement | null;
  /** Anchored glass brightens on hover and flattens on press */
  button?: boolean;
  /** Re-copy a large source at most every this many ms. Default 0 */
  throttle?: number;
}

export type PresetName = "clear" | "frosted" | "dark" | "prism" | "dome";

export class LiquidGlass {
  /** Starting looks, each a set of parameters: glass.set(LiquidGlass.presets.frosted) */
  static presets: Record<PresetName, GlassParams>;
  /** Creates glass that refracts `source`, a live element */
  constructor(source: HTMLElement, options?: GlassOptions);
  /** The glass's own element */
  readonly el: HTMLDivElement;
  readonly params: Required<Omit<GlassParams, "body" | "falloff" | "lightAngle" | "stretch">> & GlassParams;
  readonly visible: boolean;
  readonly destroyed: boolean;
  /** Updates any of the parameters */
  set(params: GlassParams): void;
  /** Moves the lens to a point in viewport (client) coordinates, showing it */
  moveTo(x: number, y: number): void;
  /** Grows the lens slightly while true */
  press(down: boolean): void;
  /** Fades the lens in or out. With pop it bursts like a bubble on the way out and swells back in */
  show(visible: boolean, options?: { pop?: boolean }): void;
  /** Removes the glass and everything it added, and stops it listening. Safe to call twice */
  destroy(): void;
}

export interface Looks {
  switch: { light: GlassParams; dark: GlassParams };
  tabs: { light: GlassParams; dark: GlassParams };
  button: { light: GlassParams; dark: GlassParams };
}
/** The components' glass, light and dark, tuned against iOS 26 */
export const LOOKS: Looks;

export interface GlassSwitchOptions {
  /** How much bigger than the thumb the lens grows. Default 1.55 */
  grow?: number;
  /** How much more it swells while pressed. Default 1.08 */
  press?: number;
  /** How far the lens leans towards a hovering pointer, in px. Default 4 */
  lean?: number;
  /** The glass. Default LOOKS.switch for the nearest [data-theme] */
  look?: GlassParams;
}

/**
 * A switch, or a segmented switch with a label each side. Fires a bubbling "change"
 * CustomEvent with detail.value (0 or 1).
 */
export class GlassSwitch {
  constructor(root: HTMLElement, options?: GlassSwitchOptions);
  readonly root: HTMLElement;
  readonly lens: LiquidGlass;
  /** 0 or 1 */
  readonly value: number;
  select(index: number): void;
  destroy(): void;
}

export interface GlassTabBarOptions {
  /** How much bigger than a tab the lens grows. Default 1.3 */
  grow?: number;
  /** How much more it swells while pressed. Default 1.1 */
  press?: number;
  /** The glass. Default LOOKS.tabs for the nearest [data-theme] */
  look?: GlassParams;
}

/** A floating tab bar. Fires a bubbling "change" CustomEvent with detail.tab (the element). */
export class GlassTabBar {
  constructor(root: HTMLElement, options?: GlassTabBarOptions);
  readonly root: HTMLElement;
  readonly lens: LiquidGlass;
  readonly tabs: HTMLElement[];
  readonly current: HTMLElement | null;
  choose(tab: HTMLElement): void;
  destroy(): void;
}

export interface GlassButtonOptions {
  /** Where the lens lives. Default the button's parent */
  container?: HTMLElement;
  /** What it refracts. Default the container's [data-glass-source] child */
  source?: HTMLElement;
  /** Growth when hovered. Default 1.1 */
  grow?: number;
  /** More growth when pressed. Default 1.08 */
  press?: number;
  /** How opaque the tint gets, 0 to 1. Default 0.95 */
  lit?: number;
  /** How long it stays lit after release, in ms. Default 120 */
  hang?: number;
  /** The glass. Default LOOKS.button for the nearest [data-theme] */
  look?: GlassParams;
}

export class GlassButton {
  constructor(button: HTMLElement, options?: GlassButtonOptions);
  readonly btn: HTMLElement;
  readonly lens: LiquidGlass;
  destroy(): void;
}

export type GlassComponent = GlassSwitch | GlassTabBar | GlassButton;

/** Builds every [data-glass-switch], [data-glass-tabs] and [data-glass-button] under root */
export function initComponents(root?: ParentNode): GlassComponent[];
