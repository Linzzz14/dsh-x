/**
 * dsh-x — host half.
 *
 * Composes features onto one prefixed route. Everything feature-specific lives
 * in `host/features/`; this file only wires: `name`, injected services, and the
 * single webServer registration.
 */
import { CSRF_HEADER, PLUGIN_ID, ROUTE } from "./shared/constants.js";
import { createRouter } from "./host/core/http.js";
import deleteSession from "./host/features/delete-session.js";

const features = [deleteSession];

/** Services every feature relies on, regardless of what it does. */
const CORE_INJECT = ["webServer"];

export const name = PLUGIN_ID;

export const inject = [
  ...new Set([...CORE_INJECT, ...features.flatMap((feature) => feature.inject ?? [])])
];

export function apply(ctx) {
  const router = createRouter({
    base: ROUTE,
    csrfHeader: CSRF_HEADER,
    csrfValue: PLUGIN_ID
  });

  for (const feature of features) feature.mount(router, ctx);

  ctx.effect(
    () => ctx.webServer.register({
      kind: "prefix",
      path: ROUTE,
      handler: (req, res) => router.handle(ctx, req, res)
    }),
    "dsh-x: session delete route"
  );
}
