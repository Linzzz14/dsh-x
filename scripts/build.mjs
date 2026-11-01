/**
 * Builds both halves into `lib/`:
 *   - lib/index.js   host plugin (ESM, Node 22) — loaded by cordis.patch.yml
 *   - lib/client.js  client plugin (CJS, browser) — loaded by the web harness
 *
 * `@deepseek-ai/*` and React stay external: the harness provides them at
 * runtime. Everything else, including this plugin's own modules, is bundled.
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { PLUGIN_ID } from "../src/shared/constants.js";

const dshExternal = ["@deepseek-ai/cordis", "@deepseek-ai/dsh-*"];

mkdirSync("lib", { recursive: true });

await build({
  entryPoints: ["src/index.js"],
  outfile: "lib/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["node22"],
  sourcemap: true,
  external: dshExternal,
  logLevel: "info"
});

await build({
  entryPoints: ["src/client/index.js"],
  outfile: "lib/client.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2022"],
  sourcemap: true,
  external: [...dshExternal, "react", "react-dom", "react-dom/client", "scheduler"],
  banner: {
    js: `window.__ModuleLoader__.load({ id: '${PLUGIN_ID}', factory: (require) => { "use strict"; var module = { exports: {} }; var exports = module.exports;`
  },
  footer: { js: "return module.exports; } });" },
  logLevel: "info"
});
