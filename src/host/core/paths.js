/**
 * Where sessions live and what counts as a safe path to touch.
 *
 * Anything destructive must go through `checkedSessionDir` first: it rejects
 * ids that are not plain names, directories outside the sessions root, and any
 * component that is (or resolves through) a symlink.
 */
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { lstat, readdir, realpath, rmdir, rm } from "node:fs/promises";
import { HttpError } from "./http.js";

export const HOME = process.env.DSH_HOME || join(homedir(), ".dsh");
export const CACHE_ROOT = join(HOME, "storages", "session_projcache", "sessions");

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export function assertSessionId(id) {
  if (typeof id !== "string" || !SESSION_ID.test(id)) {
    throw new HttpError(400, "BAD_SESSION_ID", "不是合法的会话 ID");
  }
  return id;
}

export function sessionsRoot(ctx) {
  const configured = ctx.sessionPersistence.root;
  return resolve(typeof configured === "string" ? configured : join(HOME, "sessions"));
}

/**
 * Validate one `<root>/<project>/<sessionId>` directory. Returns the checked
 * absolute path when it exists, `undefined` when it does not, and throws when
 * the path escapes the root or passes through a symlink.
 */
export async function checkedSessionDir(root, dir, id) {
  const base = resolve(root);
  const target = resolve(dir);
  const rel = relative(base, target);
  const parts = rel.split(sep);
  if (isAbsolute(rel) || parts.length !== 2 || parts[0] === "" || parts[0] === "." ||
      parts[0] === ".." || parts[1] !== id) {
    throw new HttpError(500, "UNSAFE_PATH", "会话目录超出允许范围，已停止删除");
  }

  let info;
  try {
    info = await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new HttpError(500, "UNSAFE_PATH", "会话目录不是普通目录，已停止删除");
  }

  const project = dirname(target);
  const baseReal = await realpath(base);
  for (const candidate of [project, target]) {
    const current = await lstat(candidate);
    if (current.isSymbolicLink() || !current.isDirectory()) {
      throw new HttpError(500, "UNSAFE_PATH", "会话目录不能是符号链接，已停止删除");
    }
    const sub = relative(baseReal, await realpath(candidate));
    if (isAbsolute(sub) || sub === "" || sub.split(sep).includes("..")) {
      throw new HttpError(500, "UNSAFE_PATH", "会话目录解析到了允许范围之外");
    }
  }
  return target;
}

/** All existing directories for one id, across every project bucket. */
export async function sessionDirs(ctx, id) {
  const root = sessionsRoot(ctx);
  const candidates = new Set();
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
    if (checked !== undefined) dirs.push(checked);
  }
  return dirs;
}

/** Removes one session directory and prunes its project bucket when empty. */
export async function removeSessionDir(ctx, id, dir) {
  const checked = await checkedSessionDir(sessionsRoot(ctx), dir, id);
  if (checked === undefined) return false;
  await rm(checked, { recursive: true, force: true });
  const project = dirname(checked);
  try {
    if ((await readdir(project)).length === 0) await rmdir(project);
  } catch {
    // The bucket is shared by other sessions or already gone: leave it.
  }
  return true;
}
