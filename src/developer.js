import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import "highlight.js/styles/github-dark.css";

import glassSource from "./glass.js?raw";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("xml", xml);

const PLACEHOLDER_IMAGE = "your-image.jpg";

const indent = (text, spaces) =>
  text
    .split("\n")
    .map((line) => (line ? " ".repeat(spaces) + line : line))
    .join("\n");

// glass.js without the export, so it runs from a plain <script>
const standaloneModule = () => glassSource.replace("export class LiquidGlass", "class LiquidGlass").trim();

function snippet({ params, imageUrl }) {
  const { tint, ...rest } = params;
  const lens = tint ? params : rest;
  const settings = JSON.stringify(lens, null, 2).replace(/"(\w+)":/g, "$1:");
  return `<!-- The lens refracts everything inside this element. Put your own HTML in it. -->
<main id="liquid-glass-scene" style="position:relative;display:grid;place-items:center;height:480px;border-radius:24px;overflow:hidden;touch-action:none;background:#111 url('${imageUrl ?? PLACEHOLDER_IMAGE}') center/cover">
  <h1 style="margin:0;font:700 72px/1 system-ui,sans-serif;color:#fff">Liquid Glass</h1>
</main>

<script type="module">
${indent(standaloneModule(), 2)}

  const scene = document.getElementById("liquid-glass-scene");
  const glass = new LiquidGlass(scene);

  glass.set(${indent(settings, 2).trimStart()});

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

const TABS = {
  snippet: { language: "xml", file: "liquid-glass.html" },
  module: { language: "javascript", file: "glass.js" },
};

// The panel lives in its own section. It re-renders as the lens is tuned, but only while
// it's on screen: highlighting the whole module on every slider tick isn't free.
export function initDeveloper({ glass, getImageUrl }) {
  const $ = (sel) => document.querySelector(sel);
  const panel = $("#dev");
  const code = $("#dev-code");
  const note = $("#dev-note");
  const copyButton = $("#dev-copy");
  const copyLabel = copyButton.querySelector("span");
  const tabs = [...panel.querySelectorAll("[role=tab]")];

  let activeTab = "snippet";
  let visible = false;
  let stale = true;
  let copyTimer;

  const source = () => {
    if (activeTab === "module") return glassSource.trim();
    return snippet({ params: glass.params, imageUrl: getImageUrl() });
  };

  function render() {
    stale = true;
    if (!visible) return;
    stale = false;
    const { language } = TABS[activeTab];
    code.innerHTML = hljs.highlight(source(), { language }).value;
    note.hidden = activeTab !== "snippet" || Boolean(getImageUrl());
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && stale) render();
  }).observe(panel);

  function selectTab(tab) {
    activeTab = tab.dataset.tab;
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
    }
    code.parentElement.parentElement.scrollTop = 0;
    render();
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
      next.focus();
      selectTab(next);
    });
  }

  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(source());
    copyLabel.textContent = "Copied";
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copyLabel.textContent = "Copy"), 1600);
  });

  $("#dev-download").addEventListener("click", () => {
    const { file } = TABS[activeTab];
    const isPage = activeTab === "snippet";
    const text = isPage ? page(source()) : source() + "\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: isPage ? "text/html" : "text/plain" }));
    link.download = file;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  return { render };
}
