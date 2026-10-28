import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import glsl from "highlight.js/lib/languages/glsl";
import "highlight.js/styles/github-dark.css";

import glassSource from "./glass.js?raw";
import fragSource from "./glass.frag?raw";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("glsl", glsl);

const PLACEHOLDER_IMAGE = "your-image.jpg";

const indent = (text, spaces) =>
  text
    .split("\n")
    .map((line) => (line ? " ".repeat(spaces) + line : line))
    .join("\n");

// glass.js with the shader inlined, so it runs without a bundler
function standaloneModule() {
  return glassSource
    .replace(/import fragSource from .*\n/, `const fragSource = \`\n${fragSource.trim()}\n\`;\n`)
    .replace("export class LiquidGlass", "class LiquidGlass")
    .trim();
}

function snippet({ params, imageUrl }) {
  const settings = JSON.stringify(params, null, 2).replace(/"(\w+)":/g, "$1:");
  return `<canvas id="liquid-glass" style="display:block;width:100%;height:480px;border-radius:24px;touch-action:none"></canvas>

<script type="module">
${indent(standaloneModule(), 2)}

  const canvas = document.getElementById("liquid-glass");
  const glass = new LiquidGlass(canvas);

  glass.set(${indent(settings, 2).trimStart()});

  const image = new Image();
  image.crossOrigin = "anonymous"; // the image host must allow CORS
  image.onload = () => glass.setImage(image);
  image.src = "${imageUrl ?? PLACEHOLDER_IMAGE}";

  const toLocal = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  canvas.addEventListener("pointermove", (e) => glass.moveTo(...toLocal(e)));
  canvas.addEventListener("pointerdown", (e) => {
    glass.moveTo(...toLocal(e));
    glass.press(true);
  });
  canvas.addEventListener("pointerleave", () => glass.moveTo(canvas.clientWidth / 2, canvas.clientHeight / 2));
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
  shader: { language: "glsl", file: "glass.frag" },
};

export function initDeveloper({ glass, getImageUrl, onToggle }) {
  const $ = (sel) => document.querySelector(sel);
  const drawer = $("#dev");
  const openButton = $("#dev-open");
  const closeButton = $("#dev-close");
  const code = $("#dev-code");
  const note = $("#dev-note");
  const copyButton = $("#dev-copy");
  const copyLabel = copyButton.querySelector("span");
  const tabs = [...drawer.querySelectorAll("[role=tab]")];

  let activeTab = "snippet";
  let isOpen = false;
  let copyTimer;

  const source = () => {
    if (activeTab === "module") return glassSource.trim();
    if (activeTab === "shader") return fragSource.trim();
    return snippet({ params: glass.params, imageUrl: getImageUrl() });
  };

  function render() {
    if (!isOpen) return;
    const { language } = TABS[activeTab];
    code.innerHTML = hljs.highlight(source(), { language }).value;
    note.hidden = activeTab !== "snippet" || Boolean(getImageUrl());
  }

  function selectTab(tab) {
    activeTab = tab.dataset.tab;
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
    }
    code.parentElement.scrollTop = 0;
    render();
  }

  function setOpen(open) {
    isOpen = open;
    drawer.toggleAttribute("data-open", open);
    drawer.inert = !open;
    openButton.setAttribute("aria-expanded", String(open));
    onToggle?.(open);
    if (open) {
      render();
      closeButton.focus({ preventScroll: true });
    } else {
      openButton.focus({ preventScroll: true });
    }
  }

  openButton.addEventListener("click", () => setOpen(true));
  closeButton.addEventListener("click", () => setOpen(false));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) setOpen(false);
  });

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

  return { render, get isOpen() { return isOpen; } };
}
