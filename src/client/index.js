/**
 * dsh-x — browser half.
 *
 * Bundled by `scripts/build.mjs` into `lib/client.js`, wrapped in the
 * `window.__ModuleLoader__` shell the harness expects. Feature modules live in
 * `client/features/`; this file only composes them.
 */
import deleteSession from "./features/delete-session.js";

const features = [deleteSession];

export const inject = [
  ...new Set(features.flatMap((feature) => feature.inject ?? []))
];

export function apply(ctx) {
  for (const feature of features) feature.apply(ctx);
}
