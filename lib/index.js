// src/shared/constants.js
var PLUGIN_ID = "dsh-x";
var ROUTE = "/api/dsh-x";
var CSRF_HEADER = "x-dsh-plugin";

// src/host/core/log.js
var warn = (ctx, message) => ctx.logger?.warn?.(`${PLUGIN_ID}: ${message}`);

// src/host/core/http.js
var HttpError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
var MAX_BODY_BYTES = 16 * 1024;
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, "BODY_TOO_LARGE", "\u8BF7\u6C42\u4F53\u8FC7\u5927");
  }
  if (raw.trim() === "") return {};
  try {
    const value = JSON.parse(raw);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
  }
  throw new HttpError(400, "BAD_JSON", "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
}
function send(res, status, body) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}
function createRouter({ base, csrfHeader, csrfValue }) {
  const routes = /* @__PURE__ */ new Map();
  const routeKey = (method, url) => `${method} ${url.pathname.startsWith(base) ? url.pathname.slice(base.length) || "/" : "/"}`;
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
          throw new HttpError(403, "FORBIDDEN", `\u7F3A\u5C11 ${csrfHeader} \u8BF7\u6C42\u5934`);
        }
        const url = new URL(req.url ?? "/", "http://localhost");
        const handler = routes.get(routeKey(req.method, url));
        if (handler === void 0) throw new HttpError(404, "NOT_FOUND", "\u672A\u77E5\u63A5\u53E3");
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

// src/host/core/paths.js
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { lstat, readdir, realpath, rmdir, rm } from "node:fs/promises";
var HOME = process.env.DSH_HOME || join(homedir(), ".dsh");
var CACHE_ROOT = join(HOME, "storages", "session_projcache", "sessions");
var SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
function assertSessionId(id) {
  if (typeof id !== "string" || !SESSION_ID.test(id)) {
    throw new HttpError(400, "BAD_SESSION_ID", "\u4E0D\u662F\u5408\u6CD5\u7684\u4F1A\u8BDD ID");
  }
  return id;
}
function sessionsRoot(ctx) {
  const configured = ctx.sessionPersistence.root;
  return resolve(typeof configured === "string" ? configured : join(HOME, "sessions"));
}
async function checkedSessionDir(root, dir, id) {
  const base = resolve(root);
  const target = resolve(dir);
  const rel = relative(base, target);
  const parts = rel.split(sep);
  if (isAbsolute(rel) || parts.length !== 2 || parts[0] === "" || parts[0] === "." || parts[0] === ".." || parts[1] !== id) {
    throw new HttpError(500, "UNSAFE_PATH", "\u4F1A\u8BDD\u76EE\u5F55\u8D85\u51FA\u5141\u8BB8\u8303\u56F4\uFF0C\u5DF2\u505C\u6B62\u5220\u9664");
  }
  let info;
  try {
    info = await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new HttpError(500, "UNSAFE_PATH", "\u4F1A\u8BDD\u76EE\u5F55\u4E0D\u662F\u666E\u901A\u76EE\u5F55\uFF0C\u5DF2\u505C\u6B62\u5220\u9664");
  }
  const project = dirname(target);
  const baseReal = await realpath(base);
  for (const candidate of [project, target]) {
    const current = await lstat(candidate);
    if (current.isSymbolicLink() || !current.isDirectory()) {
      throw new HttpError(500, "UNSAFE_PATH", "\u4F1A\u8BDD\u76EE\u5F55\u4E0D\u80FD\u662F\u7B26\u53F7\u94FE\u63A5\uFF0C\u5DF2\u505C\u6B62\u5220\u9664");
    }
    const sub = relative(baseReal, await realpath(candidate));
    if (isAbsolute(sub) || sub === "" || sub.split(sep).includes("..")) {
      throw new HttpError(500, "UNSAFE_PATH", "\u4F1A\u8BDD\u76EE\u5F55\u89E3\u6790\u5230\u4E86\u5141\u8BB8\u8303\u56F4\u4E4B\u5916");
    }
  }
  return target;
}
async function sessionDirs(ctx, id) {
  const root = sessionsRoot(ctx);
  const candidates = /* @__PURE__ */ new Set();
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      candidates.add(join(root, entry.name, id));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const dirs = [];
  for (const candidate of candidates) {
    const checked = await checkedSessionDir(root, candidate, id);
    if (checked !== void 0) dirs.push(checked);
  }
  return dirs;
}
async function removeSessionDir(ctx, id, dir) {
  const checked = await checkedSessionDir(sessionsRoot(ctx), dir, id);
  if (checked === void 0) return false;
  await rm(checked, { recursive: true, force: true });
  const project = dirname(checked);
  try {
    if ((await readdir(project)).length === 0) await rmdir(project);
  } catch {
  }
  return true;
}

// src/host/core/sessions.js
var settle = (ms) => new Promise((done) => setTimeout(done, ms));
var headerOf = (snapshot) => snapshot?.header ?? snapshot;
async function listHeaders(ctx) {
  const snapshots = await ctx.sessionPersistence.list();
  return (Array.isArray(snapshots) ? snapshots : []).map(headerOf).filter((header) => header && typeof header.id === "string");
}
function collectDescendants(rootId, headers) {
  const children = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set([rootId]);
  for (const header of headers) {
    if (header.origin !== "subagent" || typeof header.parentSession !== "string") continue;
    if (!children.has(header.parentSession)) children.set(header.parentSession, []);
    children.get(header.parentSession).push(header);
  }
  const found = [];
  const queue = [rootId];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      found.push(child);
      queue.push(child.id);
    }
  }
  return found;
}
function agentOf(ctx, id) {
  try {
    return ctx.agents.get(id);
  } catch {
    return void 0;
  }
}
async function activeKinds(ctx, id) {
  const kinds = /* @__PURE__ */ new Set();
  const agent = agentOf(ctx, id);
  if (agent && (agent.status === "running" || agent.busy === true)) kinds.add("turn");
  try {
    if (ctx.sessions.get(id)?.activeTurn !== void 0) kinds.add("turn");
  } catch {
    kinds.add("turn");
  }
  if (typeof ctx.waterfall === "function") {
    try {
      const activity = await ctx.waterfall("workspace/session-activity", { sessionId: id }, () => Promise.resolve([]));
      for (const item of Array.isArray(activity) ? activity : []) {
        kinds.add(typeof item?.kind === "string" ? item.kind : "task");
      }
    } catch {
    }
  }
  return [...kinds];
}
function workspaceHas(ctx, id) {
  try {
    const registry = ctx.workspaceRegistry;
    const state = registry.requireState?.();
    if (state?.archivedSessionIds?.includes(id) || state?.pinnedSessionIds?.includes(id)) return true;
    return registry.list().some(
      (entity) => entity.record?.sessionIds?.includes(id) || entity.sessionIds?.includes(id)
    );
  } catch {
    return false;
  }
}
function findSession(ctx, id, headers) {
  const stored = headers.find((header) => header.id === id);
  if (stored !== void 0) return stored;
  try {
    const live = ctx.sessions.get(id);
    if (live !== void 0) return live.header;
  } catch {
  }
  return workspaceHas(ctx, id) ? { id } : void 0;
}
async function detachLive(ctx, id) {
  const agent = agentOf(ctx, id);
  if (agent !== void 0) {
    try {
      agent.cancel?.({ kind: "disposed" });
    } catch {
    }
    if (typeof agent.scope?.dispose === "function") {
      try {
        await Promise.race([Promise.resolve(agent.scope.dispose()), settle(2e3)]);
      } catch {
      }
    }
    try {
      ctx.agents.store?.delete?.(id);
    } catch {
    }
  }
  const session = ctx.sessions.get(id);
  if (session === void 0) return;
  try {
    await ctx.sessions.flush?.(session);
  } catch (error) {
    warn(ctx, `flush before delete failed for ${id}: ${error?.message ?? error}`);
  }
  try {
    const entry = ctx.sessions.store?.get?.(id);
    if (typeof entry?.detach === "function") {
      entry.detach();
      await settle(200);
    }
  } catch (error) {
    warn(ctx, `detach before delete failed for ${id}: ${error?.message ?? error}`);
  }
}
function emitDisposed(ctx, id) {
  try {
    ctx.emit("session/disposed", { id });
  } catch (error) {
    warn(ctx, `session/disposed emit failed for ${id}: ${error?.message ?? error}`);
  }
}

// src/host/features/delete-session.js
import { readdir as readdir2, unlink } from "node:fs/promises";
import { join as join2 } from "node:path";
var deleting = /* @__PURE__ */ new Set();
async function removeCachedRecord(ctx, id) {
  const cache = ctx.sessionProjectionCache;
  try {
    if (typeof cache?.requireTable === "function") await cache.requireTable().delete(id);
  } catch (error) {
    warn(ctx, `projection checkpoint delete failed for ${id}: ${error?.message ?? error}`);
  }
  let names = [];
  try {
    names = await readdir2(CACHE_ROOT);
  } catch (error) {
    if (error.code !== "ENOENT") warn(ctx, `projection cache scan failed: ${error?.message ?? error}`);
  }
  for (const name2 of names) {
    if (name2 !== `${id}.json` && !name2.startsWith(`${id}.json.bak.`)) continue;
    try {
      await unlink(join2(CACHE_ROOT, name2));
    } catch (error) {
      if (error.code !== "ENOENT") warn(ctx, `projection cache file delete failed: ${error?.message ?? error}`);
    }
  }
}
async function forgetInWorkspace(ctx, id) {
  const registry = ctx.workspaceRegistry;
  await registry.unarchiveSession(id);
  await registry.unpinSession(id);
  for (const entity of registry.list()) {
    if (entity.record?.sessionIds?.includes(id) || entity.sessionIds?.includes(id)) {
      await entity.detachSession(id);
    }
  }
}
async function preview(ctx, id) {
  assertSessionId(id);
  const headers = await listHeaders(ctx);
  const root = findSession(ctx, id, headers);
  if (root === void 0) throw new HttpError(404, "SESSION_NOT_FOUND", "\u4F1A\u8BDD\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664");
  const descendants = collectDescendants(id, headers);
  const running = [];
  for (const sessionId of [id, ...descendants.map((header) => header.id)]) {
    if ((await activeKinds(ctx, sessionId)).length > 0) running.push(sessionId);
  }
  return { sessionId: id, subagentCount: descendants.length, running };
}
async function deleteSession(ctx, id) {
  assertSessionId(id);
  const headers = await listHeaders(ctx);
  const root = findSession(ctx, id, headers);
  if (root === void 0) throw new HttpError(404, "SESSION_NOT_FOUND", "\u4F1A\u8BDD\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664");
  const targets = [root, ...collectDescendants(id, headers)];
  const seen = /* @__PURE__ */ new Set();
  const unique = targets.filter((header) => {
    if (seen.has(header.id)) return false;
    seen.add(header.id);
    return true;
  });
  const running = [];
  for (const header of unique) {
    if ((await activeKinds(ctx, header.id)).length > 0) running.push(header.id);
  }
  if (running.length > 0) {
    throw new HttpError(409, "SESSION_RUNNING", "\u4F1A\u8BDD\u4ECD\u6709\u8FD0\u884C\u4E2D\u7684\u5DE5\u4F5C\uFF0C\u65E0\u6CD5\u5220\u9664\u3002\u8BF7\u5148\u505C\u6B62\u540E\u518D\u8BD5\u3002");
  }
  for (const header of unique) await sessionDirs(ctx, header.id);
  for (const header of unique) await detachLive(ctx, header.id);
  for (const header of unique) {
    for (const dir of await sessionDirs(ctx, header.id)) {
      await removeSessionDir(ctx, header.id, dir);
    }
  }
  for (const header of unique) await forgetInWorkspace(ctx, header.id);
  for (const header of unique) emitDisposed(ctx, header.id);
  for (const header of unique) await removeCachedRecord(ctx, header.id);
  return {
    sessionId: id,
    deleted: unique.map((header) => header.id),
    subagentCount: unique.length - 1
  };
}
var delete_session_default = {
  id: "delete-session",
  inject: ["sessionPersistence", "sessionProjectionCache", "workspaceRegistry", "sessions", "agents"],
  mount(router) {
    router.get("/preview", async ({ ctx, url, res }) => {
      const id = url.searchParams.get("sessionId") ?? "";
      send(res, 200, { ok: true, result: await preview(ctx, id) });
    });
    router.post("/delete", async ({ ctx, req, res }) => {
      const body = await readJson(req);
      const id = assertSessionId(typeof body.sessionId === "string" ? body.sessionId : "");
      if (deleting.has(id)) throw new HttpError(409, "SESSION_BUSY", "\u8BE5\u4F1A\u8BDD\u6B63\u5728\u5220\u9664\uFF0C\u8BF7\u7A0D\u5019");
      deleting.add(id);
      try {
        send(res, 200, { ok: true, result: await deleteSession(ctx, id) });
      } finally {
        deleting.delete(id);
      }
    });
  }
};

// src/index.js
var features = [delete_session_default];
var CORE_INJECT = ["webServer"];
var name = PLUGIN_ID;
var inject = [
  .../* @__PURE__ */ new Set([...CORE_INJECT, ...features.flatMap((feature) => feature.inject ?? [])])
];
function apply(ctx) {
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
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
