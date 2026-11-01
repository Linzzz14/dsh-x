/**
 * Delete session: removes one session and everything DSH keeps for it.
 *
 *   - the session-owned directory under `<DSH_HOME>/sessions` (all log
 *     generations, the write lock, and any temporary files);
 *   - the session-projection checkpoint under
 *     `<DSH_HOME>/storages/session_projcache/sessions`;
 *   - the session's slot in every workspace record, plus its pin/archive
 *     membership;
 *   - every descendant subagent session (`origin: "subagent"`), recursively.
 *
 * Active work makes the session undeletable. Attachments are deliberately left
 * alone: DSH stores them as immutable, content-addressed objects shared by
 * resumed and forked sessions with no reference counting, so deleting them
 * from one session could corrupt another.
 */
import { HttpError, readJson, send } from "../core/http.js";
import { assertSessionId, CACHE_ROOT, removeSessionDir, sessionDirs } from "../core/paths.js";
import {
  activeKinds,
  collectDescendants,
  detachLive,
  emitDisposed,
  findSession,
  listHeaders
} from "../core/sessions.js";
import { warn } from "../core/log.js";
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

/** Sessions this process is already deleting; a second request gets 409. */
const deleting = new Set();

async function removeCachedRecord(ctx, id) {
  const cache = ctx.sessionProjectionCache;
  try {
    if (typeof cache?.requireTable === "function") await cache.requireTable().delete(id);
  } catch (error) {
    warn(ctx, `projection checkpoint delete failed for ${id}: ${error?.message ?? error}`);
  }
  let names = [];
  try {
    names = await readdir(CACHE_ROOT);
  } catch (error) {
    if (error.code !== "ENOENT") warn(ctx, `projection cache scan failed: ${error?.message ?? error}`);
  }
  for (const name of names) {
    if (name !== `${id}.json` && !name.startsWith(`${id}.json.bak.`)) continue;
    try {
      await unlink(join(CACHE_ROOT, name));
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

export async function preview(ctx, id) {
  assertSessionId(id);
  const headers = await listHeaders(ctx);
  const root = findSession(ctx, id, headers);
  if (root === undefined) throw new HttpError(404, "SESSION_NOT_FOUND", "会话不存在或已被删除");
  const descendants = collectDescendants(id, headers);
  const running = [];
  for (const sessionId of [id, ...descendants.map((header) => header.id)]) {
    if ((await activeKinds(ctx, sessionId)).length > 0) running.push(sessionId);
  }
  return { sessionId: id, subagentCount: descendants.length, running };
}

export async function deleteSession(ctx, id) {
  assertSessionId(id);
  const headers = await listHeaders(ctx);
  const root = findSession(ctx, id, headers);
  if (root === undefined) throw new HttpError(404, "SESSION_NOT_FOUND", "会话不存在或已被删除");

  const targets = [root, ...collectDescendants(id, headers)];
  const seen = new Set();
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
    throw new HttpError(409, "SESSION_RUNNING", "会话仍有运行中的工作，无法删除。请先停止后再试。");
  }

  // Validate every existing path BEFORE mutating anything. The same scan is
  // repeated after detach because flushing a live blank session can create its
  // first artifact during teardown.
  for (const header of unique) await sessionDirs(ctx, header.id);

  for (const header of unique) await detachLive(ctx, header.id);
  for (const header of unique) {
    for (const dir of await sessionDirs(ctx, header.id)) {
      await removeSessionDir(ctx, header.id, dir);
    }
  }
  for (const header of unique) await forgetInWorkspace(ctx, header.id);
  // Notify before dropping the checkpoint: a live-session detach above may
  // already have emitted this event, and keeping the order means no listener
  // can recreate a cache record after it has been removed.
  for (const header of unique) emitDisposed(ctx, header.id);
  for (const header of unique) await removeCachedRecord(ctx, header.id);

  return {
    sessionId: id,
    deleted: unique.map((header) => header.id),
    subagentCount: unique.length - 1
  };
}

export default {
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
      if (deleting.has(id)) throw new HttpError(409, "SESSION_BUSY", "该会话正在删除，请稍候");
      deleting.add(id);
      try {
        send(res, 200, { ok: true, result: await deleteSession(ctx, id) });
      } finally {
        deleting.delete(id);
      }
    });
  }
};
