# Liquid Glass

A WebGL "liquid glass" lens that refracts, frosts and splits the light of whatever sits behind it. Move your cursor (or drag on touch) and the lens follows with spring physics, stretching as it moves.

Built with vanilla JavaScript, a single fragment shader, [Vite](https://vite.dev) and [Tailwind CSS](https://tailwindcss.com).

## Features

- Rounded-rectangle lens with a curved, refracting rim
- Frosted blur, chromatic dispersion, rim lighting and a soft drop shadow
- Spring-driven movement with squash and stretch, plus a press effect
- Live controls for size, corners, refraction, frost and dispersion
- Built-in backgrounds, or upload / drag and drop your own image
- Developer panel that generates a drop-in snippet with your current settings
- Retina aware, touch friendly, keyboard nudging, respects `prefers-reduced-motion`

## Getting started

```sh
bun install
bun run dev
```

Then open the URL Vite prints. `bun run build` outputs a static site to `dist/`.

npm works too: `npm install && npm run dev`.

## Use it on your own site

Open the **Developer** tab on the right edge of the demo, tune the lens, then copy or download the snippet. It's a `<canvas>` plus a script with no dependencies and no build step.

If you use a bundler, copy [`src/glass.js`](src/glass.js) and [`src/glass.frag`](src/glass.frag) into your project instead:

```js
import { LiquidGlass } from "./glass.js";

const canvas = document.querySelector("canvas");
const glass = new LiquidGlass(canvas);

glass.set({ width: 280, height: 180, radius: 64 });

const image = new Image();
image.crossOrigin = "anonymous";
image.onload = () => glass.setImage(image);
image.src = "/your-image.jpg";

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  glass.moveTo(e.clientX - rect.left, e.clientY - rect.top);
});
```

The canvas sizes itself to its CSS box, so give it a width and height. Images from another origin must be served with CORS headers.

### API

| Method | Description |
| --- | --- |
| `new LiquidGlass(canvas)` | Sets up WebGL on the canvas. Throws if WebGL is unavailable. |
| `set(params)` | Updates any of the parameters below. |
| `setImage(image)` | Fades to a new `HTMLImageElement` or canvas. Large images are downscaled. |
| `moveTo(x, y)` | Moves the lens to a point in CSS pixels, relative to the canvas. |
| `press(down)` | Grows the lens slightly while `true`. |

| Parameter | Default | Description |
| --- | --- | --- |
| `width`, `height` | `280`, `180` | Lens size in CSS pixels |
| `radius` | `64` | Corner radius in CSS pixels |
| `refraction` | `40` | How far the rim bends the image, in CSS pixels |
| `frost` | `2` | Blur radius in CSS pixels |
| `chroma` | `0.4` | Chromatic dispersion at the rim, `0` to `1` |
| `zoom` | `1.08` | Magnification across the whole lens |

## Project structure

```
index.html          Page and UI markup (Tailwind)
src/glass.frag      Fragment shader: lens shape, refraction, frost, lighting
src/glass.js        LiquidGlass renderer and spring physics
src/main.js         Demo UI: backgrounds, sliders, pointer handling
src/developer.js    Developer panel and snippet generator
src/style.css       Tailwind entry and custom slider styles
```

## Credits

Inspired by [this CodePen by shingidad](https://codepen.io/shingidad/pen/jEPxMgW), which this project started as a rebuild of.

Background photos from [Pexels](https://www.pexels.com).
