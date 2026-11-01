/**
 * Loads the built client bundle the way the harness does — through
 * `window.__ModuleLoader__.load` with a `require` for the injected modules —
 * and asserts the slot registrations survive the bundle.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: "fragment",
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useSyncExternalStore: () => null
};

const primitives = {
  Modal: "Modal",
  Button: "Button",
  MenuItemButton: "MenuItemButton",
  IconTrashOutlineRegular: "IconTrashOutlineRegular"
};

let loaded;

/** The bundle registers itself once; every test reuses that registration. */
function loadBundle() {
  if (loaded !== undefined) return loaded;
  let captured;
  globalThis.window = { __ModuleLoader__: { load: (definition) => { captured = definition; } } };
  require_("../lib/client.js");
  const requireStub = (id) => (id === "react" ? React : primitives);
  loaded = { definition: captured, exports: captured.factory(requireStub) };
  return loaded;
}

test("client bundle registers through the module loader", () => {
  const { definition, exports } = loadBundle();
  assert.equal(definition.id, "dsh-x");
  assert.deepEqual(exports.inject, ["slots", "locale", "sessions", "uiWorkspace"]);
  assert.equal(typeof exports.apply, "function");
});

test("applying the client registers dictionaries, menu item and overlay", () => {
  const { exports } = loadBundle();
  const slots = [];
  const locales = [];

  const ctx = {
    effect: (factory) => factory(),
    locale: { register: (ns, dictionaries) => locales.push({ ns, dictionaries }) },
    slots: {
      inject: (_name, factory) => factory(),
      register: (definition) => slots.push(definition)
    }
  };

  exports.apply(ctx);

  assert.equal(slots.length, 2);
  assert.equal(slots[0].id, "dsh-x-delete");
  assert.equal(slots[0].name, "sidebar.workspaces.session.menu.item");
  assert.equal(slots[0].order, Number.MAX_SAFE_INTEGER);
  assert.equal(slots[1].id, "dsh-x-delete-confirm");
  assert.equal(slots[1].name, "shell.overlay");

  assert.equal(locales.length, 1);
  assert.equal(locales[0].ns, "dsh-x");
  assert.ok(locales[0].dictionaries.zh.menu);
  assert.ok(locales[0].dictionaries.en.menu);
});
