/**
 * HTTP plumbing shared by every feature: one error type, one JSON reader, one
 * response writer, and one prefix router. Features only declare routes.
 */
import { warn } from "./log.js";

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MAX_BODY_BYTES = 16 * 1024;

export async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, "BODY_TOO_LARGE", "请求体过大");
  }
  if (raw.trim() === "") return {};
  try {
    const value = JSON.parse(raw);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    // Fall through to the stable invalid-body error.
  }
  throw new HttpError(400, "BAD_JSON", "请求体必须是 JSON 对象");
}

export function send(res, status, body) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

/**
 * Mounts under a single path prefix. Handlers receive `{ ctx, req, res, url }`
 * and may throw `HttpError`; everything else becomes a logged 500.
 */
export function createRouter({ base, csrfHeader, csrfValue }) {
  const routes = new Map();

  const routeKey = (method, url) =>
    `${method} ${url.pathname.startsWith(base) ? url.pathname.slice(base.length) || "/" : "/"}`;

  const router = {
    get(path, handler) {
      routes.set(`GET ${path}`, handler);
      return router;
    },

    post(path, handler) {
      routes.set(`POST ${path}`, handler);
      return router;
    },

    async handle(ctx, req, res) {
      try {
        if (req.method === "POST" && req.headers[csrfHeader] !== csrfValue) {
          throw new HttpError(403, "FORBIDDEN", `缺少 ${csrfHeader} 请求头`);
        }
        const url = new URL(req.url ?? "/", "http://localhost");
        const handler = routes.get(routeKey(req.method, url));
        if (handler === undefined) throw new HttpError(404, "NOT_FOUND", "未知接口");
        await handler({ ctx, req, res, url });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        if (status >= 500) warn(ctx, `request failed: ${error?.stack ?? error}`);
        send(res, status, {
          ok: false,
          code: error?.code ?? "INTERNAL",
          error: error instanceof HttpError ? error.message : String(error?.message ?? error)
        });
      }
    }
  };

  return router;
}
