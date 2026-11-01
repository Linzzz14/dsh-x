/**
 * Values both halves must agree on. Duplicating them is how a plugin ends up
 * with a client that calls a route the host never mounted.
 */
export const PLUGIN_ID = "dsh-x";
export const ROUTE = "/api/dsh-x";
export const CSRF_HEADER = "x-dsh-plugin";
