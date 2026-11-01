/**
 * Reading session state and safely quiescing live sessions. Every destructive
 * feature should start here rather than talking to the stores directly.
 */
import { warn } from "./log.js";

const settle = (ms) => new Promise((done) => setTimeout(done, ms));

export const headerOf = (snapshot) => snapshot?.header ?? snapshot;

export async function listHeaders(ctx) {
  const snapshots = await ctx.sessionPersistence.list();
  return (Array.isArray(snapshots) ? snapshots : [])
    .map(headerOf)
    .filter((header) => header && typeof header.id === "string");
}

/** Every subagent session below `rootId`, breadth-first and deduplicated. */
export function collectDescendants(rootId, headers) {
  const children = new Map();
  const seen = new Set([rootId]);
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

export function agentOf(ctx, id) {
  try {
    return ctx.agents.get(id);
  } catch {
    return undefined;
  }
}

/** Activity families that make a session unsafe to delete. */
export async function activeKinds(ctx, id) {
  const kinds = new Set();
  const agent = agentOf(ctx, id);
  if (agent && (agent.status === "running" || agent.busy === true)) kinds.add("turn");
  try {
    if (ctx.sessions.get(id)?.activeTurn !== undefined) kinds.add("turn");
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
      // The registry is advisory here; the agent/session checks above still
      // cover the turn family.
    }
  }
  return [...kinds];
}

export function workspaceHas(ctx, id) {
  try {
    const registry = ctx.workspaceRegistry;
    const state = registry.requireState?.();
    if (state?.archivedSessionIds?.includes(id) || state?.pinnedSessionIds?.includes(id)) return true;
    return registry.list().some((entity) =>
      entity.record?.sessionIds?.includes(id) || entity.sessionIds?.includes(id)
    );
  } catch {
    return false;
  }
}

/** Finds a session in persisted headers, then the live store, then workspaces. */
export function findSession(ctx, id, headers) {
  const stored = headers.find((header) => header.id === id);
  if (stored !== undefined) return stored;
  try {
    const live = ctx.sessions.get(id);
    if (live !== undefined) return live.header;
  } catch {
    // Fall through to workspace membership.
  }
  return workspaceHas(ctx, id) ? { id } : undefined;
}

/** Quiesce and detach one live session without writing anything to its log. */
export async function detachLive(ctx, id) {
  const agent = agentOf(ctx, id);
  if (agent !== undefined) {
    try {
      agent.cancel?.({ kind: "disposed" });
    } catch {
      // A stale agent handle must not block deleting an idle session.
    }
    if (typeof agent.scope?.dispose === "function") {
      try {
        await Promise.race([Promise.resolve(agent.scope.dispose()), settle(2000)]);
      } catch {
        // Continue: the session store detach below is the real barrier.
      }
    }
    try {
      ctx.agents.store?.delete?.(id);
    } catch {
      // Best effort; the agent registry owns its own teardown.
    }
  }

  const session = ctx.sessions.get(id);
  if (session === undefined) return;
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

export function emitDisposed(ctx, id) {
  try {
    // The shape the API proxy relays: it reads only `id`, so this cannot
    // accidentally re-checkpoint a cold session through the projection cache.
    ctx.emit("session/disposed", { id });
  } catch (error) {
    warn(ctx, `session/disposed emit failed for ${id}: ${error?.message ?? error}`);
  }
}
