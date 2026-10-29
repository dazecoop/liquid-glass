// The npm package's build, into lib/ (the demo site builds to dist/ with vite.config.js).
//   vite build -c vite.lib.config.js              ESM and CommonJS: the core and the React bindings
//   vite build -c vite.lib.config.js --mode iife  one minified file for a <script> tag
import { copyFileSync, readdirSync } from "node:fs";
import { defineConfig } from "vite";

// The stylesheet and the hand-written type definitions ship as they are
const copyStatic = () => ({
  name: "copy-static",
  closeBundle() {
    copyFileSync("src/liquid-glass.css", "lib/liquid-glass.css");
    // .d.cts too, so TypeScript resolves types for require() as well as import
    for (const f of readdirSync("types")) {
      copyFileSync(`types/${f}`, `lib/${f}`);
      copyFileSync(`types/${f}`, `lib/${f.replace(".d.ts", ".d.cts")}`);
    }
  },
});

export default defineConfig(({ mode }) =>
  mode === "iife"
    ? {
        publicDir: false,
        build: {
          outDir: "lib",
          emptyOutDir: false,
          lib: { entry: "src/global.js", name: "LiquidGlass", formats: ["iife"], fileName: () => "liquid-glass.global.js" },
        },
      }
    : {
        publicDir: false,
        plugins: [copyStatic()],
        // The automatic runtime imports react/jsx-runtime itself, rather than expecting React in scope
        esbuild: { jsx: "automatic" },
        build: {
          outDir: "lib",
          minify: false,
          lib: {
            entry: { index: "src/index.js", react: "src/react.jsx" },
            formats: ["es", "cjs"],
            fileName: (format, name) => `${name}.${format === "es" ? "js" : "cjs"}`,
          },
          rollupOptions: {
            external: ["react", "react/jsx-runtime"],
            output: {
              // Next.js's app router needs this to treat the bindings as client components
              banner: (chunk) => (chunk.name === "react" ? '"use client";' : ""),
            },
          },
        },
      },
);
