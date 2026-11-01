import { PLUGIN_ID } from "../../shared/constants.js";

/** Every line this plugin logs is prefixed, so host logs are attributable. */
export const warn = (ctx, message) => ctx.logger?.warn?.(`${PLUGIN_ID}: ${message}`);
