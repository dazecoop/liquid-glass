// The <script> build's entry: everything hangs off one global, window.LiquidGlass, so
// `new LiquidGlass(el)` works as it does from the module, and so does
// `LiquidGlass.initComponents()`
import { LiquidGlass } from "./glass.js";
import { GlassSwitch, GlassTabBar, GlassButton, LOOKS, initComponents } from "./components.js";

Object.assign(LiquidGlass, { LiquidGlass, GlassSwitch, GlassTabBar, GlassButton, LOOKS, initComponents });

export default LiquidGlass;
