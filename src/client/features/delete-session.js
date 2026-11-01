/**
 * Delete session: the final item of the native Session row "..." menu.
 *
 * The menu item order is the largest safe integer so it stays after every
 * current built-in and every normal plugin item. The confirmation lives in
 * `shell.overlay`, not inside the menu item: the menu unmounts its children as
 * soon as it closes, so a modal rendered there would disappear with the click.
 *
 * Deleting the Session currently shown in the main view clears that view the
 * same way the native Archive action does.
 */
import * as React from "react";
import * as P from "@deepseek-ai/dsh-client-ui-primitives";
import { PLUGIN_ID } from "../../shared/constants.js";
import { api, HEADERS } from "../core/api.js";
import { ConfirmDialog, errorStyle, pendingStyle } from "../core/modal.js";
import { createStore } from "../core/store.js";

const h = React.createElement;
const NS = PLUGIN_ID;

const zh = {
  menu: "删除会话",
  title: "删除会话",
  desc: "「{title}」及其磁盘上的全部内容将被永久删除，无法恢复。",
  subagents: "同时删除 {count} 个关联的子智能体会话。",
  cancel: "取消",
  close: "关闭",
  confirm: "删除会话",
  deleting: "正在删除…",
  running: "会话仍有运行中的工作，无法删除。请先停止后再试。",
  notFound: "会话不存在或已被删除。",
  failed: "删除失败：{message}",
  untitled: "未命名会话"
};

const en = {
  menu: "Delete session",
  title: "Delete session",
  desc: "“{title}” and all of its data on disk will be permanently deleted. This cannot be undone.",
  subagents: "{count} related subagent session(s) will be deleted too.",
  cancel: "Cancel",
  close: "Close",
  confirm: "Delete session",
  deleting: "Deleting…",
  running: "This session still has active work. Stop it before deleting.",
  notFound: "The session does not exist or has already been deleted.",
  failed: "Delete failed: {message}",
  untitled: "Untitled session"
};

// A single pending target, shared by the row menu item and the global overlay.
const pending = createStore();

/** The Session retained by the main view, matching ui-workspace's own check. */
function currentSessionId(ctx) {
  try {
    const list = ctx.sessions?.list?.getSnapshot?.();
    for (const row of Object.values(list?.byId ?? {})) {
      if ((row?.retainedBy?.mainView ?? 0) > 0) return row.id;
    }
  } catch {
    // No main-view reference is a valid state.
  }
  return undefined;
}

/** Mirror ui-workspace's Archive behavior after deleting what is on screen. */
function clearMainFor(ctx, deleted) {
  const current = currentSessionId(ctx);
  if (current !== undefined && !deleted.includes(current)) return;
  try {
    ctx.uiWorkspace?.clearMain?.();
  } catch {
    // The host row is already gone; a failed view clear is cosmetic.
  }
}

function DeleteMenuItem({ sessionId, displayTitle, useMenuOpenState, t }) {
  const [, setMenuOpen] = useMenuOpenState();
  return h(P.MenuItemButton, {
    icon: h(P.IconTrashOutlineRegular, {}),
    onSelect: () => {
      setMenuOpen(false);
      pending.set({ sessionId, title: displayTitle || t("untitled") });
    }
  }, t("menu"));
}

function DeleteOverlay({ ctx, t }) {
  const target = pending.use();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const targetId = target?.sessionId;

  React.useEffect(() => {
    setBusy(false);
    setError("");
    setPreview(null);
    if (targetId === undefined) return;

    let alive = true;
    const controller = new AbortController();
    api(`/preview?sessionId=${encodeURIComponent(targetId)}`, { signal: controller.signal })
      .then((result) => {
        if (alive) setPreview(result);
      })
      .catch(() => {
        // Preview is advisory; deletion itself re-validates on the host.
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [targetId]);

  if (target === null) return null;

  const running = Array.isArray(preview?.running) && preview.running.length > 0;
  const subagentCount = Number.isInteger(preview?.subagentCount) ? preview.subagentCount : 0;
  const description = t("desc", { title: target.title }) +
    (subagentCount > 0 ? ` ${t("subagents", { count: subagentCount })}` : "");
  const close = () => {
    if (!busy) pending.set(null);
  };

  const submit = async () => {
    if (busy || running) return;
    const viewed = currentSessionId(ctx);
    setBusy(true);
    setError("");
    try {
      const result = await api("/delete", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ sessionId: target.sessionId })
      });
      pending.set(null);
      if (viewed !== undefined && Array.isArray(result?.deleted) && result.deleted.includes(viewed)) {
        clearMainFor(ctx, result.deleted);
      }
    } catch (failure) {
      const message = failure?.code === "SESSION_RUNNING"
        ? t("running")
        : failure?.code === "SESSION_NOT_FOUND"
          ? t("notFound")
          : t("failed", { message: failure?.message ?? String(failure) });
      setError(message);
      setBusy(false);
    }
  };

  return h(ConfirmDialog, {
    title: t("title"),
    description,
    closeLabel: t("close"),
    cancelLabel: t("cancel"),
    confirmLabel: t("confirm"),
    busy,
    blocked: running,
    onClose: close,
    onConfirm: submit
  },
    running ? h("div", { role: "alert", style: errorStyle }, t("running")) : null,
    busy ? h("div", { role: "status", style: pendingStyle }, t("deleting")) : null,
    error !== "" ? h("div", { role: "alert", style: errorStyle }, error) : null
  );
}

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-x: dictionaries");

  ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
    name: "sidebar.workspaces.session.menu.item",
    id: "dsh-x-delete",
    // The largest safe integer order keeps this item last in the native
    // sorted list, after Copy Session ID and any normal plugin addition.
    order: Number.MAX_SAFE_INTEGER,
    locale: NS
  }, DeleteMenuItem));

  const Overlay = (props) => h(DeleteOverlay, { ...props, ctx });
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "dsh-x-delete-confirm",
    order: 1000,
    locale: NS
  }, Overlay));
}

export default {
  id: "delete-session",
  inject: ["slots", "locale", "sessions", "uiWorkspace"],
  apply
};
