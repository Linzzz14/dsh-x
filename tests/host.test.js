import test from "node:test";
import assert from "node:assert/strict";

import { assertSessionId, checkedSessionDir } from "../src/host/core/paths.js";
import { createRouter } from "../src/host/core/http.js";
import { name, inject, apply } from "../lib/index.js";

test("session ids accept plain names and reject traversal", () => {
  assert.equal(assertSessionId("01J8ZK4W7Q"), "01J8ZK4W7Q");
  assert.equal(assertSessionId("a.b_c-d"), "a.b_c-d");

  for (const bad of ["", "../etc", "a/b", ".hidden", "a b", "x".repeat(201), "会话"]) {
    assert.throws(() => assertSessionId(bad), /不是合法的会话 ID/, JSON.stringify(bad));
  }
});

test("checked directory rejects paths outside the sessions root", async () => {
  const root = "/tmp/dsh-x-test-root";
  await assert.rejects(
    checkedSessionDir(root, "/etc/passwd", "passwd"),
    /超出允许范围/
  );
});

test("router answers unknown paths and missing CSRF headers", async () => {
  const router = createRouter({ base: "/api/dsh-x", csrfHeader: "x-dsh-plugin", csrfValue: "dsh-x" });
  const seen = [];
  router.post("/thing", async ({ res }) => {
    seen.push("hit");
    res.end("ok");
  });

  const response = () => ({ headersSent: false, writableEnded: false, body: null, writeHead() {}, end(v) { this.body = v; } });

  const denied = response();
  await router.handle({ logger: { warn() {} } }, { method: "POST", url: "/api/dsh-x/thing", headers: {} }, denied);
  assert.match(JSON.parse(denied.body).error, /x-dsh-plugin/);
  assert.equal(seen.length, 0);

  const missing = response();
  await router.handle({ logger: { warn() {} } }, { method: "GET", url: "/api/dsh-x/nope", headers: {} }, missing);
  assert.equal(JSON.parse(missing.body).code, "NOT_FOUND");
});

test("host entry exposes the plugin contract", () => {
  assert.equal(name, "dsh-x");
  assert.deepEqual(inject, [
    "webServer",
    "sessionPersistence",
    "sessionProjectionCache",
    "workspaceRegistry",
    "sessions",
    "agents"
  ]);
  assert.equal(typeof apply, "function");
});

test("apply mounts one prefix route that validates input", async () => {
  const registered = [];
  const ctx = {
    effect: (factory) => factory(),
    webServer: { register: (definition) => registered.push(definition) }
  };
  apply(ctx);

  assert.equal(registered.length, 1);
  assert.equal(registered[0].kind, "prefix");
  assert.equal(registered[0].path, "/api/dsh-x");

  const res = { headersSent: false, writableEnded: false, writeHead() {}, end(value) { this.body = value; } };
  await registered[0].handler({ method: "GET", url: "/api/dsh-x/preview?sessionId=../x", headers: {} }, res);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.equal(body.code, "BAD_SESSION_ID");
});
