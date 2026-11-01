import { CSRF_HEADER, PLUGIN_ID, ROUTE } from "../../shared/constants.js";

export const HEADERS = { "content-type": "application/json", [CSRF_HEADER]: PLUGIN_ID };

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Calls one of this plugin's routes and unwraps `{ ok, result }`. */
export async function api(path, options) {
  const response = await fetch(ROUTE + path, options);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("BAD_RESPONSE", `HTTP ${response.status}`);
  }
  if (!response.ok || body?.ok !== true) {
    throw new ApiError(body?.code ?? "HTTP_ERROR", body?.error ?? `HTTP ${response.status}`);
  }
  return body.result;
}
