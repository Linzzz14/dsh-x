window.__ModuleLoader__.load({ id: 'dsh-x', factory: (require) => { "use strict"; var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply2,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/features/delete-session.js
var React3 = __toESM(require("react"), 1);
var P2 = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"), 1);

// src/shared/constants.js
var PLUGIN_ID = "dsh-x";
var ROUTE = "/api/dsh-x";
var CSRF_HEADER = "x-dsh-plugin";

// src/client/core/api.js
var HEADERS = { "content-type": "application/json", [CSRF_HEADER]: PLUGIN_ID };
var ApiError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
async function api(path, options) {
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

// src/client/core/modal.js
var React = __toESM(require("react"), 1);
var P = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"), 1);
var h = React.createElement;
var pendingStyle = { color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: "18px" };
var errorStyle = { color: "var(--dsw-alias-state-error-primary)", marginTop: 8, fontSize: 12, lineHeight: "18px" };
function ConfirmDialog({
  title,
  description,
  closeLabel,
  cancelLabel,
  confirmLabel,
  busy,
  blocked,
  onClose,
  onConfirm,
  children
}) {
  return h(P.Modal, {
    open: true,
    onClose,
    closeLabel,
    title,
    description,
    footer: h(
      React.Fragment,
      null,
      h(P.Button, { variant: "outline", disabled: busy, onClick: onClose }, cancelLabel),
      h(P.Button, {
        variant: "outline",
        disabled: busy || blocked,
        onClick: onConfirm,
        style: busy || blocked ? void 0 : { color: "var(--dsw-alias-state-error-primary)" }
      }, confirmLabel)
    )
  }, children);
}

// src/client/core/store.js
var React2 = __toESM(require("react"), 1);
function createStore(initial = null) {
  let value = initial;
  const listeners = /* @__PURE__ */ new Set();
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const set = (next) => {
    value = next;
    for (const listener of listeners) listener();
  };
  const use = () => React2.useSyncExternalStore(subscribe, () => value);
  return { get: () => value, set, subscribe, use };
}

// src/client/features/delete-session.js
var h2 = React3.createElement;
var NS = PLUGIN_ID;
var zh = {
  menu: "\u5220\u9664\u4F1A\u8BDD",
  title: "\u5220\u9664\u4F1A\u8BDD",
  desc: "\u300C{title}\u300D\u53CA\u5176\u78C1\u76D8\u4E0A\u7684\u5168\u90E8\u5185\u5BB9\u5C06\u88AB\u6C38\u4E45\u5220\u9664\uFF0C\u65E0\u6CD5\u6062\u590D\u3002",
  subagents: "\u540C\u65F6\u5220\u9664 {count} \u4E2A\u5173\u8054\u7684\u5B50\u667A\u80FD\u4F53\u4F1A\u8BDD\u3002",
  cancel: "\u53D6\u6D88",
  close: "\u5173\u95ED",
  confirm: "\u5220\u9664\u4F1A\u8BDD",
  deleting: "\u6B63\u5728\u5220\u9664\u2026",
  running: "\u4F1A\u8BDD\u4ECD\u6709\u8FD0\u884C\u4E2D\u7684\u5DE5\u4F5C\uFF0C\u65E0\u6CD5\u5220\u9664\u3002\u8BF7\u5148\u505C\u6B62\u540E\u518D\u8BD5\u3002",
  notFound: "\u4F1A\u8BDD\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664\u3002",
  failed: "\u5220\u9664\u5931\u8D25\uFF1A{message}",
  untitled: "\u672A\u547D\u540D\u4F1A\u8BDD"
};
var en = {
  menu: "Delete session",
  title: "Delete session",
  desc: "\u201C{title}\u201D and all of its data on disk will be permanently deleted. This cannot be undone.",
  subagents: "{count} related subagent session(s) will be deleted too.",
  cancel: "Cancel",
  close: "Close",
  confirm: "Delete session",
  deleting: "Deleting\u2026",
  running: "This session still has active work. Stop it before deleting.",
  notFound: "The session does not exist or has already been deleted.",
  failed: "Delete failed: {message}",
  untitled: "Untitled session"
};
var pending = createStore();
function currentSessionId(ctx) {
  try {
    const list = ctx.sessions?.list?.getSnapshot?.();
    for (const row of Object.values(list?.byId ?? {})) {
      if ((row?.retainedBy?.mainView ?? 0) > 0) return row.id;
    }
  } catch {
  }
  return void 0;
}
function clearMainFor(ctx, deleted) {
  const current = currentSessionId(ctx);
  if (current !== void 0 && !deleted.includes(current)) return;
  try {
    ctx.uiWorkspace?.clearMain?.();
  } catch {
  }
}
function DeleteMenuItem({ sessionId, displayTitle, useMenuOpenState, t }) {
  const [, setMenuOpen] = useMenuOpenState();
  return h2(P2.MenuItemButton, {
    icon: h2(P2.IconTrashOutlineRegular, {}),
    onSelect: () => {
      setMenuOpen(false);
      pending.set({ sessionId, title: displayTitle || t("untitled") });
    }
  }, t("menu"));
}
function DeleteOverlay({ ctx, t }) {
  const target = pending.use();
  const [busy, setBusy] = React3.useState(false);
  const [error, setError] = React3.useState("");
  const [preview, setPreview] = React3.useState(null);
  const targetId = target?.sessionId;
  React3.useEffect(() => {
    setBusy(false);
    setError("");
    setPreview(null);
    if (targetId === void 0) return;
    let alive = true;
    const controller = new AbortController();
    api(`/preview?sessionId=${encodeURIComponent(targetId)}`, { signal: controller.signal }).then((result) => {
      if (alive) setPreview(result);
    }).catch(() => {
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [targetId]);
  if (target === null) return null;
  const running = Array.isArray(preview?.running) && preview.running.length > 0;
  const subagentCount = Number.isInteger(preview?.subagentCount) ? preview.subagentCount : 0;
  const description = t("desc", { title: target.title }) + (subagentCount > 0 ? ` ${t("subagents", { count: subagentCount })}` : "");
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
      if (viewed !== void 0 && Array.isArray(result?.deleted) && result.deleted.includes(viewed)) {
        clearMainFor(ctx, result.deleted);
      }
    } catch (failure) {
      const message = failure?.code === "SESSION_RUNNING" ? t("running") : failure?.code === "SESSION_NOT_FOUND" ? t("notFound") : t("failed", { message: failure?.message ?? String(failure) });
      setError(message);
      setBusy(false);
    }
  };
  return h2(
    ConfirmDialog,
    {
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
    running ? h2("div", { role: "alert", style: errorStyle }, t("running")) : null,
    busy ? h2("div", { role: "status", style: pendingStyle }, t("deleting")) : null,
    error !== "" ? h2("div", { role: "alert", style: errorStyle }, error) : null
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
  const Overlay = (props) => h2(DeleteOverlay, { ...props, ctx });
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "dsh-x-delete-confirm",
    order: 1e3,
    locale: NS
  }, Overlay));
}
var delete_session_default = {
  id: "delete-session",
  inject: ["slots", "locale", "sessions", "uiWorkspace"],
  apply
};

// src/client/index.js
var features = [delete_session_default];
var inject = [
  ...new Set(features.flatMap((feature) => feature.inject ?? []))
];
function apply2(ctx) {
  for (const feature of features) feature.apply(ctx);
}
return module.exports; } });
//# sourceMappingURL=client.js.map
