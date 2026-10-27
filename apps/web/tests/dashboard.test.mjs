import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(name, globals = {}) {
  const source = ts.transpileModule(
    readFileSync(
      new URL("../src/lib/" + name + ".ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const context = { exports: {}, URL, process: { env: {} }, ...globals };
  vm.runInNewContext(source, context);
  return context.exports;
}
const display = load("dashboard-display");
const response = (body, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => body,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test("T41 formats GBP exactly and separates unscored/unavailable and unknown provenance", () => {
  for (const [value, expected] of [
    ["0.00", "£0.00"],
    ["0.01", "£0.01"],
    ["1234.56", "£1,234.56"],
    ["9999999999.99", "£9,999,999,999.99"],
    ["invalid", "Amount unavailable"],
  ])
    assert.equal(display.gbp(value), expected);
  assert.equal(display.riskLabel("low_risk"), "Low");
  assert.equal(display.riskLabel("moderate_risk"), "Moderate");
  assert.equal(display.riskLabel("high_risk"), "High");
  assert.equal(display.riskLabel("unscored"), "Not yet scored");
  assert.equal(display.riskLabel("unexpected"), "Unavailable");
  assert.match(
    display.provenanceLabel("historical_unknown"),
    /unknown provenance/,
  );
  assert.match(
    display.provenanceLabel("unverified"),
    /No independent settlement evidence/,
  );
});
test("T41 local simulation requires explicit development preview, loopback host and API", () => {
  const env = {
    NODE_ENV: "development",
    NEXT_PUBLIC_API_URL: "http://localhost:3040/api/v1",
    T41_LOCAL_SIMULATION_PREVIEW: "true",
  };
  assert.equal(
    display.dashboardConfig(env, "localhost:2025").localSimulation,
    true,
  );
  for (const patch of [
    { NODE_ENV: "production" },
    { T41_LOCAL_SIMULATION_PREVIEW: "false" },
    { NEXT_PUBLIC_API_URL: "https://api.example.invalid/api/v1" },
  ])
    assert.ok(
      !display.dashboardConfig({ ...env, ...patch }, "localhost:2025")
        ?.localSimulation,
    );
  assert.equal(
    display.dashboardConfig(env, "public.example.invalid").localSimulation,
    false,
  );
  assert.equal(
    display.dashboardConfig(
      {
        ...env,
        NEXT_PUBLIC_API_URL: "https://user:password@example.invalid/api/v1",
      },
      "localhost",
    ),
    null,
  );
});
test("T41 serializes concurrent refresh and retries exact mutation body/key once", async () => {
  const calls = [];
  const refresh = deferred();
  let count = 0;
  const { DashboardSession } = load("dashboard-session", {
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/auth/login")) return response({ accessToken: "old" });
      if (url.endsWith("/members/me")) return response({ id: "member" });
      if (url.endsWith("/auth/refresh")) {
        count++;
        await refresh.promise;
        return response({ accessToken: "new" });
      }
      if (init.headers.Authorization === "Bearer old") return response({}, 401);
      return response({ ok: true });
    },
  });
  const session = new DashboardSession("http://api");
  await session.login("a@example.invalid", "secret");
  const body = JSON.stringify({ amount: "1.01" });
  const a = session.request("/accounts/a/deposit", {
    method: "POST",
    body,
    headers: { "Idempotency-Key": "original" },
  });
  const b = session.request("/accounts/overview");
  await new Promise((r) => setImmediate(r));
  assert.equal(count, 1);
  refresh.resolve();
  await Promise.all([a, b]);
  const mutations = calls.filter((c) => c.url.endsWith("/deposit"));
  assert.equal(mutations.length, 2);
  assert.ok(
    mutations.every(
      (c) =>
        c.init.body === body &&
        c.init.headers["Idempotency-Key"] === "original",
    ),
  );
  assert.ok(
    calls.every(
      (c) => c.init.cache === "no-store" && c.init.credentials === "include",
    ),
  );
  assert.deepEqual(
    JSON.parse(calls.find((c) => c.url.endsWith("/auth/refresh")).init.body),
    { memberId: "member" },
  );
  assert.ok(calls.every((c) => !c.url.includes("/membership")));
});
test("T41 failed second 401 clears session, calls unauthorized and never loops", async () => {
  let refreshes = 0,
    reads = 0,
    ended = 0;
  const { DashboardSession } = load("dashboard-session", {
    fetch: async (url) => {
      if (url.endsWith("/auth/login")) return response({ accessToken: "old" });
      if (url.endsWith("/members/me")) return response({ id: "member" });
      if (url.endsWith("/auth/refresh")) {
        refreshes++;
        return response({ accessToken: "new" });
      }
      reads++;
      return response({}, 401);
    },
  });
  const session = new DashboardSession("http://api", () => ended++);
  await session.login("a", "b");
  await assert.rejects(session.request("/accounts/overview"));
  assert.equal(refreshes, 1);
  assert.equal(reads, 2);
  assert.equal(ended, 1);
  await assert.rejects(session.request("/accounts/overview"));
  assert.equal(reads, 2);
});
test("T41 a late login, private read or refresh cannot restore a logged-out or switched session", async () => {
  for (const stage of ["login", "read", "refresh"]) {
    const pending = deferred();
    let old = true;
    const { DashboardSession } = load("dashboard-session", {
      fetch: async (url, init) => {
        if (url.endsWith("/auth/login")) {
          if (stage === "login" && old) await pending.promise;
          return response({ accessToken: old ? "old" : "new" });
        }
        if (url.endsWith("/members/me"))
          return response({ id: old ? "old-member" : "new-member" });
        if (url.endsWith("/auth/logout")) return response({});
        if (url.endsWith("/auth/refresh")) {
          await pending.promise;
          return response({ accessToken: "late" });
        }
        if (stage === "refresh" && old) return response({}, 401);
        if (stage === "read" && old) await pending.promise;
        return response({ member: init.headers.Authorization });
      },
    });
    const session = new DashboardSession("http://api");
    let task;
    if (stage === "login") task = session.login("old", "secret");
    else {
      await session.login("old", "secret");
      task = session.request("/accounts/overview");
    }
    const rejected = assert.rejects(task);
    await new Promise((r) => setImmediate(r));
    await session.logout();
    old = false;
    await session.login("new", "secret");
    pending.resolve();
    await rejected;
    const result = await session.request("/accounts/overview");
    assert.equal(result.member, "Bearer new");
  }
});
test("T41 refresh outage clears private credentials and invalid paths never send", async () => {
  let ended = 0;
  const { DashboardSession } = load("dashboard-session", {
    fetch: async (url) => {
      if (url.endsWith("/auth/login")) return response({ accessToken: "old" });
      if (url.endsWith("/members/me")) return response({ id: "member" });
      if (url.endsWith("/auth/refresh")) throw new Error("Redis unavailable");
      return response({}, 401);
    },
  });
  const session = new DashboardSession("http://api", () => ended++);
  await session.login("a", "b");
  await assert.rejects(session.request("/accounts/overview"));
  assert.equal(ended, 1);
  await assert.rejects(session.request("/accounts/overview"));
  await assert.rejects(session.request("//other.example.invalid"));
});
