import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromeEnvironment, waitForChrome } from "./helpers/chrome.mjs";
function child() {
  const c = new EventEmitter();
  c.stderr = new EventEmitter();
  c.exitCode = null;
  c.signalCode = null;
  return c;
}
async function fixture(run) {
  const profile = await mkdtemp(
    path.join(os.tmpdir(), "safethrift-chrome-unit-"),
  );
  try {
    await run(profile);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}
function cleaned(c) {
  assert.equal(c.listenerCount("error"), 0);
  assert.equal(c.listenerCount("exit"), 0);
  assert.equal(c.stderr.listenerCount("data"), 0);
}
test("Chrome readiness accepts the active-port file without a stderr announcement", () =>
  fixture(async (profile) => {
    const c = child();
    const result = waitForChrome(c, profile, { timeoutMs: 1000, pollMs: 5 });
    c.stderr.emit(
      "data",
      Buffer.from("D-Bus diagnostic without DevTools announcement"),
    );
    await writeFile(path.join(profile, "DevToolsActivePort"), "\n");
    await writeFile(
      path.join(profile, "DevToolsActivePort"),
      "43123\n/devtools/browser/fixture-id\n",
    );
    assert.equal(
      await result,
      "ws://127.0.0.1:43123/devtools/browser/fixture-id",
    );
    cleaned(c);
  }));
test("Chrome readiness still accepts a split stderr announcement", () =>
  fixture(async (profile) => {
    const c = child();
    const result = waitForChrome(c, profile, { timeoutMs: 1000, pollMs: 5 });
    c.stderr.emit("data", Buffer.from("DevTools listening "));
    c.stderr.emit(
      "data",
      Buffer.from("on ws://127.0.0.1:43123/devtools/browser/fi"),
    );
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    assert.equal(settled, false);
    c.stderr.emit("data", Buffer.from("xture-id\n"));
    assert.equal(
      await result,
      "ws://127.0.0.1:43123/devtools/browser/fixture-id",
    );
    cleaned(c);
  }));
test("Chrome readiness reports early exit and spawn errors immediately", () =>
  fixture(async (profile) => {
    for (const kind of ["exit", "error"]) {
      const c = child();
      const result = waitForChrome(c, profile, { timeoutMs: 10000, pollMs: 5 });
      const rejection = assert.rejects(
        result,
        kind === "exit"
          ? /code=23.*signal=null/
          : /launch failed: missing binary/,
      );
      if (kind === "exit") c.emit("exit", 23, null);
      else c.emit("error", new Error("missing binary"));
      await rejection;
      cleaned(c);
    }
  }));
test("Chrome startup timeout retains bounded diagnostics and rejects invalid port files", () =>
  fixture(async (profile) => {
    await writeFile(
      path.join(profile, "DevToolsActivePort"),
      "99999\n/devtools/browser/invalid\n",
    );
    const c = child();
    const result = waitForChrome(c, profile, { timeoutMs: 40, pollMs: 5 });
    c.stderr.emit("data", Buffer.from("x".repeat(20000) + "final diagnostic"));
    await assert.rejects(result, (error) => {
      assert.match(error.message, /timed out after 40 ms/);
      assert.match(error.message, /final diagnostic/);
      assert.ok(error.message.length < 17000);
      return true;
    });
    cleaned(c);
  }));
test("Headless Chrome does not inherit a malformed desktop D-Bus session", () => {
  const env = { PATH: "/test", DBUS_SESSION_BUS_ADDRESS: "invalid-address" };
  const result = chromeEnvironment(env);
  assert.equal(result.PATH, "/test");
  assert.equal(result.DBUS_SESSION_BUS_ADDRESS, undefined);
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS, "invalid-address");
});
