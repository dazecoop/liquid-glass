import type { ComponentPropsWithoutRef, ElementType, ForwardRefExoticComponent, ReactNode, RefAttributes, RefObject } from "react";
import type { GlassOptions, GlassParams, LiquidGlass } from "./index.js";

export { LiquidGlass } from "./index.js";
export type { GlassOptions, GlassParams, PresetName } from "./index.js";

/** A ref, an element, or a function returning one */
export type ElementTarget = RefObject<HTMLElement | null> | HTMLElement | null | (() => HTMLElement | null | undefined);

export interface UseLiquidGlassOptions extends GlassParams {
  anchor?: ElementTarget;
  container?: ElementTarget;
  button?: boolean;
  throttle?: number;
}

/**
 * Builds a LiquidGlass over `source` once mounted and destroys it on unmount. Parameter
 * changes are applied with set(). Returns the instance, or null until it exists.
 * Pass a stable `source` (a ref, or a memoised function), or it rebuilds every render.
 */
export function useLiquidGlass(source: ElementTarget, options?: UseLiquidGlassOptions): LiquidGlass | null;

type Polymorphic<P> = P & { as?: ElementType } & Omit<ComponentPropsWithoutRef<"div">, keyof P>;

export interface GlassSceneProps {
  /** The lens's parameters, e.g. LiquidGlass.presets.frosted */
  glass?: GlassParams;
  children?: ReactNode;
}
/** A lens that follows the pointer over its children */
export const GlassScene: ForwardRefExoticComponent<Polymorphic<GlassSceneProps> & RefAttributes<HTMLElement>>;

export interface GlassPanelProps {
  /** What the glass refracts: something behind the panel. Default its parent */
  source?: ElementTarget;
  /** Brighten on hover and flatten on press */
  button?: boolean;
  glass?: GlassParams;
  children?: ReactNode;
}
/** An element with glass as its background */
export const GlassPanel: ForwardRefExoticComponent<Polymorphic<GlassPanelProps> & RefAttributes<HTMLElement>>;

export interface GlassSwitchProps extends Omit<ComponentPropsWithoutRef<"button">, "onChange" | "role"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  look?: GlassParams;
}
export const GlassSwitch: ForwardRefExoticComponent<GlassSwitchProps & RefAttributes<HTMLButtonElement>>;

export type SegmentOption<V> = V | { value: V; label: ReactNode };
export interface GlassSegmentProps<V = string> extends Omit<ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue"> {
  /** Exactly two options */
  options: [SegmentOption<V>, SegmentOption<V>];
  value?: V;
  defaultValue?: V;
  onChange?: (value: V) => void;
  look?: GlassParams;
}
export const GlassSegment: <V = string>(props: GlassSegmentProps<V> & RefAttributes<HTMLDivElement>) => ReactNode;

export interface TabItem<V = string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  /** Renders the tab as a link */
  href?: string;
}
export interface GlassTabBarProps<V = string> extends Omit<ComponentPropsWithoutRef<"nav">, "onChange" | "defaultValue"> {
  items: TabItem<V>[];
  value?: V;
  defaultValue?: V;
  onChange?: (value: V) => void;
  look?: GlassParams;
}
export const GlassTabBar: <V = string>(props: GlassTabBarProps<V> & RefAttributes<HTMLElement>) => ReactNode;

export interface GlassButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** What the lens refracts. Default the parent's [data-glass-source] child */
  source?: ElementTarget;
  /** The colour it lights up in. Default var(--lg-accent) */
  tint?: string;
  grow?: number;
  press?: number;
  lit?: number;
  hang?: number;
  look?: GlassParams;
}
export const GlassButton: ForwardRefExoticComponent<GlassButtonProps & RefAttributes<HTMLButtonElement>>;
