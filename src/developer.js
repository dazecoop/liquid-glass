import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import bash from "highlight.js/lib/languages/bash";
import "highlight.js/styles/github-dark.css";

import glassSource from "./glass.js?raw";
import { name as PACKAGE, version } from "../package.json";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("bash", bash);

const PLACEHOLDER_IMAGE = "your-image.jpg";
const CDN = `https://cdn.jsdelivr.net/npm/${PACKAGE}@${version}/lib`;
const INSTALL = {
  npm: `npm install ${PACKAGE}`,
  pnpm: `pnpm add ${PACKAGE}`,
  yarn: `yarn add ${PACKAGE}`,
  bun: `bun add ${PACKAGE}`,
};

const indent = (text, spaces) =>
  text
    .split("\n")
    .map((line) => (line ? " ".repeat(spaces) + line : line))
    .join("\n");

// glass.js without the export, so it runs from a plain <script>
const standaloneModule = () => glassSource.replace("export class LiquidGlass", "class LiquidGlass").trim();

// The tuned parameters as an object literal, leaving out an empty tint
function settings(params) {
  const { tint, ...rest } = params;
  return JSON.stringify(tint ? params : rest, null, 2).replace(/"(\w+)":/g, "$1:");
}

const sceneStyle = (imageUrl) =>
  `position:relative;display:grid;place-items:center;height:480px;border-radius:24px;overflow:hidden;touch-action:none;background:#111 url('${imageUrl ?? PLACEHOLDER_IMAGE}') center/cover`;

// The lens follows the pointer inside the scene, and fades when it leaves
const pointerWiring = `scene.addEventListener("pointermove", (e) => glass.moveTo(e.clientX, e.clientY));
scene.addEventListener("pointerdown", (e) => {
  glass.moveTo(e.clientX, e.clientY);
  glass.press(true);
});
scene.addEventListener("pointerup", () => glass.press(false));
scene.addEventListener("pointerleave", () => glass.show(false));`;

function reactCode({ params, imageUrl }) {
  return `import { GlassScene } from "${PACKAGE}/react";

// Your tuned lens
const glass = ${settings(params)};

export function Hero() {
  return (
    // The lens follows the pointer over everything inside, refracting it
    <GlassScene
      glass={glass}
      style={{
        display: "grid",
        placeItems: "center",
        height: 480,
        borderRadius: 24,
        overflow: "hidden",
        touchAction: "none",
        background: "#111 url('${imageUrl ?? PLACEHOLDER_IMAGE}') center/cover",
      }}
    >
      <h1 style={{ margin: 0, font: "700 72px/1 system-ui", color: "#fff" }}>Liquid Glass</h1>
    </GlassScene>
  );
}`;
}

function moduleCode({ params }) {
  return `import { LiquidGlass } from "${PACKAGE}";

// The lens refracts everything inside this element, and lives inside it
const scene = document.querySelector("#scene");
const glass = new LiquidGlass(scene, {
  container: scene,
  ...${indent(settings(params), 2).trimStart()},
});

${pointerWiring}

// When the scene goes away (a route change, say), clean up:
// glass.destroy();`;
}

function cdnCode({ params, imageUrl }) {
  return `<main id="scene" style="${sceneStyle(imageUrl)}">
  <h1 style="margin:0;font:700 72px/1 system-ui,sans-serif;color:#fff">Liquid Glass</h1>
</main>

<script src="${CDN}/liquid-glass.global.js"></script>
<script>
  const scene = document.getElementById("scene");
  const glass = new LiquidGlass(scene, {
    container: scene,
    ...${indent(settings(params), 4).trimStart()},
  });

${indent(pointerWiring, 2)}
</script>`;
}

function snippet({ params, imageUrl }) {
  return `<!-- The lens refracts everything inside this element. Put your own HTML in it. -->
<main id="liquid-glass-scene" style="${sceneStyle(imageUrl)}">
  <h1 style="margin:0;font:700 72px/1 system-ui,sans-serif;color:#fff">Liquid Glass</h1>
</main>

<script type="module">
${indent(standaloneModule(), 2)}

  const scene = document.getElementById("liquid-glass-scene");
  const glass = new LiquidGlass(scene);

  glass.set(${indent(settings(params), 2).trimStart()});

  scene.addEventListener("pointermove", (e) => glass.moveTo(e.clientX, e.clientY));
  scene.addEventListener("pointerdown", (e) => {
    glass.moveTo(e.clientX, e.clientY);
    glass.press(true);
  });
  scene.addEventListener("pointerleave", () => glass.show(false));
  addEventListener("pointerup", () => glass.press(false));
</script>`;
}

const page = (body) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Liquid Glass</title>
</head>
<body style="margin:0;padding:24px;background:#0b0b0f">
${body}
</body>
</html>
`;

// Each way in: its code, whether it starts with an install, and what a download saves
const GUIDES = {
  react: {
    language: "javascript",
    file: "Hero.jsx",
    install: true,
    hint: "Install the package, then drop the component in. It cleans up after itself on unmount, and renders on the server.",
    code: reactCode,
  },
  module: {
    language: "javascript",
    file: "glass-scene.js",
    install: true,
    hint: "Any framework, or none. Point it at an element with an #scene id.",
    code: moduleCode,
  },
  cdn: {
    language: "xml",
    file: "liquid-glass.html",
    page: true,
    hint: "No install and no build step: one script tag from jsDelivr.",
    code: cdnCode,
  },
  snippet: {
    language: "xml",
    file: "liquid-glass.html",
    page: true,
    hint: "Everything in one block, glass.js included, so it works offline and with no CDN.",
    code: snippet,
  },
};

// The components, in React and in plain HTML
const ICON = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const HTML_SETUP = `<link rel="stylesheet" href="${CDN}/liquid-glass.css" />`;
const HTML_INIT = `<script src="${CDN}/liquid-glass.global.js"></script>
<script>
  // Builds every [data-glass-switch], [data-glass-tabs] and [data-glass-button] on the page
  LiquidGlass.initComponents();
</script>`;
const COMPONENTS = {
  switch: {
    react: `import { useState } from "react";
import { GlassSwitch } from "${PACKAGE}/react";
import "${PACKAGE}/style.css";

export function WifiRow() {
  const [on, setOn] = useState(true);
  return (
    <label>
      Wi-Fi
      <GlassSwitch checked={on} onChange={setOn} />
    </label>
  );
}`,
    html: `${HTML_SETUP}

<button type="button" role="switch" aria-checked="true" aria-label="Wi-Fi" class="lg-switch" data-glass-switch>
  <span class="refract"></span><span class="thumb"></span><span data-opt></span><span data-opt></span>
</button>

${HTML_INIT}

<!-- It fires "change" with event.detail.value: 0 or 1 -->`,
  },
  segment: {
    react: `import { useState } from "react";
import { GlassSegment } from "${PACKAGE}/react";
import "${PACKAGE}/style.css";

export function Billing() {
  const [plan, setPlan] = useState("monthly");
  return (
    <GlassSegment
      aria-label="Billing"
      options={[
        { value: "monthly", label: "Monthly" },
        { value: "yearly", label: "Yearly" },
      ]}
      value={plan}
      onChange={setPlan}
    />
  );
}`,
    html: `${HTML_SETUP}

<div role="radiogroup" aria-label="Billing" class="lg-segment" data-glass-switch>
  <span class="refract"></span><span class="thumb"></span>
  <button type="button" role="radio" aria-checked="true" data-opt>Monthly</button>
  <button type="button" role="radio" aria-checked="false" data-opt>Yearly</button>
</div>

${HTML_INIT}`,
  },
  tabs: {
    react: `import { useState } from "react";
import { GlassTabBar } from "${PACKAGE}/react";
import "${PACKAGE}/style.css";

const tabs = [
  { value: "home", label: "Home", icon: <HomeIcon /> },
  { value: "browse", label: "Browse", icon: <GridIcon /> },
  { value: "search", label: "Search", icon: <SearchIcon /> },
];

export function Nav() {
  const [tab, setTab] = useState("home");
  // Position it yourself: here, floating at the bottom of the screen
  return (
    <GlassTabBar
      aria-label="Main"
      items={tabs}
      value={tab}
      onChange={setTab}
      style={{ position: "fixed", bottom: 24, left: "50%", translate: "-50% 0", width: 360 }}
    />
  );
}`,
    html: `${HTML_SETUP}

<nav class="lg-tabs" aria-label="Main" data-glass-tabs style="position:fixed;bottom:24px;left:50%;translate:-50% 0;width:360px">
  <span class="lg-pill" hidden></span>
  <span class="lg-glowbox"><span class="lg-glow"></span></span>
  <button type="button" aria-current="page">${ICON("M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19z")}Home</button>
  <button type="button">${ICON("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z")}Browse</button>
  <a href="/search">${ICON("M16 16l4 4M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13")}Search</a>
</nav>

${HTML_INIT}

<!-- It fires "change" with event.detail.tab: the tab picked -->`,
  },
  button: {
    react: `import { GlassButton } from "${PACKAGE}/react";
import "${PACKAGE}/style.css";

export function MapCard() {
  return (
    // The lens lives in the button's parent, which needs to be positioned
    <div style={{ position: "relative" }}>
      {/* What the glass refracts: whatever sits behind the button */}
      <div data-glass-source>
        <img src="map.jpg" alt="" />
      </div>
      <GlassButton tint="#0a84ff" style={{ position: "absolute", top: 16, right: 16 }}>
        Add stop
      </GlassButton>
    </div>
  );
}`,
    html: `${HTML_SETUP}

<div style="position:relative">
  <!-- What the glass refracts: whatever sits behind the button -->
  <div data-glass-source>
    <img src="map.jpg" alt="" />
  </div>
  <button type="button" class="lg-button" data-glass-button style="position:absolute;top:16px;right:16px;--tint:#0a84ff">
    <span class="lg-content">Add stop</span>
  </button>
</div>

${HTML_INIT}`,
  },
};

// Remembered between visits; storage can be blocked, so it's only a convenience
const stored = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

// Roving tabindex and arrow keys for a row of tabs or radios; `attr` marks the chosen one
function picker(buttons, attr, onPick) {
  const pick = (b) => {
    for (const other of buttons) {
      other.setAttribute(attr, String(other === b));
      other.tabIndex = other === b ? 0 : -1;
    }
    onPick(b);
  };
  for (const b of buttons) {
    b.addEventListener("click", () => pick(b));
    b.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = buttons[(buttons.indexOf(b) + step + buttons.length) % buttons.length];
      next.focus();
      pick(next);
    });
  }
  return pick;
}

// "Copy", then "Copied" for a moment
function copier(button, text) {
  const label = button.querySelector("[data-label]");
  let timer;
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(text());
    button.dataset.copied = "";
    if (label) label.textContent = "Copied";
    clearTimeout(timer);
    timer = setTimeout(() => {
      delete button.dataset.copied;
      if (label) label.textContent = "Copy";
    }, 1600);
  });
}

// The panels live in their own section. The install guide re-renders as the lens is tuned,
// but only while it's on screen: highlighting the whole module on every slider tick isn't free.
export function initDeveloper({ glass, getImageUrl }) {
  const $ = (sel) => document.querySelector(sel);
  const panel = $("#dev");
  const code = $("#dev-code");
  const note = $("#dev-note");
  const hint = $("#dev-hint");
  const install = $("#dev-install");
  const installCmd = $("#dev-install-cmd");

  let guide = stored("lg-guide", "react");
  if (!GUIDES[guide]) guide = "react";
  let manager = stored("lg-pm", "npm");
  if (!INSTALL[manager]) manager = "npm";
  let visible = false;
  let stale = true;

  const source = () => GUIDES[guide].code({ params: glass.params, imageUrl: getImageUrl() });

  function render() {
    stale = true;
    if (!visible) return;
    stale = false;
    const g = GUIDES[guide];
    code.innerHTML = hljs.highlight(source(), { language: g.language }).value;
    note.hidden = Boolean(getImageUrl());
    hint.textContent = g.hint;
    install.hidden = !g.install;
    installCmd.textContent = INSTALL[manager];
    $("#dev-download-name").textContent = g.file;
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && stale) render();
  }).observe(panel);

  const tabs = [...panel.querySelectorAll("[role=tab]")];
  const pickGuide = picker(tabs, "aria-selected", (tab) => {
    guide = tab.dataset.tab;
    store("lg-guide", guide);
    code.parentElement.parentElement.scrollTop = 0;
    render();
  });
  pickGuide(tabs.find((t) => t.dataset.tab === guide));

  const managers = [...install.querySelectorAll("[role=radio]")];
  const pickManager = picker(managers, "aria-checked", (b) => {
    manager = b.dataset.pm;
    store("lg-pm", manager);
    installCmd.textContent = INSTALL[manager];
  });
  pickManager(managers.find((b) => b.dataset.pm === manager));

  copier($("#dev-copy"), source);
  copier($("#dev-install-copy"), () => INSTALL[manager]);

  $("#dev-download").addEventListener("click", () => {
    const g = GUIDES[guide];
    const text = g.page ? page(source()) : source() + "\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: g.page ? "text/html" : "text/plain" }));
    link.download = g.file;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  initComponentGuide($);
  return { render };
}

// The components' code doesn't change with the lens, so it's highlighted once per choice
function initComponentGuide($) {
  const box = $("#dev-cmp");
  const code = $("#dev-cmp-code");
  let which = "switch";
  let flavour = stored("lg-flavour", "react") === "html" ? "html" : "react";

  const source = () => COMPONENTS[which][flavour];
  const render = () => {
    code.innerHTML = hljs.highlight(source(), { language: flavour === "react" ? "javascript" : "xml" }).value;
  };

  const tabs = [...box.querySelectorAll("[role=tab]")];
  const pickTab = picker(tabs, "aria-selected", (t) => {
    which = t.dataset.cmp;
    render();
  });
  const flavours = [...box.querySelectorAll("[role=radio]")];
  const pickFlavour = picker(flavours, "aria-checked", (b) => {
    flavour = b.dataset.flavour;
    store("lg-flavour", flavour);
    render();
  });
  pickTab(tabs[0]);
  pickFlavour(flavours.find((b) => b.dataset.flavour === flavour));
  copier($("#dev-cmp-copy"), source);
}
