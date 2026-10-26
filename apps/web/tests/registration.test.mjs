import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
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
  const context = {
    exports: {},
    require,
    URL,
    process: { env: {} },
    ...globals,
  };
  vm.runInNewContext(source, context);
  return context.exports;
}
const schema = load("registration-schema");
const personal = {
  firstName: "Fixture",
  lastName: "Only",
  dateOfBirth: "1990-01-01",
  phoneNumber: "+447911123456",
  addressLine1: "Test street",
  addressLine2: "",
  city: "Test city",
  postcode: "SW1A 1AA",
};
const application = (patch = {}) => ({
  personalDetails: personal,
  membershipType: "individual",
  householdMembers: [],
  occupation: "",
  referralSource: "",
  whyJoining: "",
  declarations: [false, true, false, true],
  contentVersion: schema.DEVELOPMENT_CONTENT_VERSION,
  signatureText: "Fixture Only",
  signedDate: "2026-01-01",
  preferredPaymentMethod: "bank_transfer",
  ...patch,
});
test("T40 schemas support all steps without asserting legal consent or charging payments", () => {
  assert.equal(schema.applicationSchema.safeParse(application()).success, true);
  assert.equal(
    schema.accountSchema.safeParse({
      ...personal,
      email: "fixture@example.invalid",
      password: "Fixture@1234",
    }).success,
    true,
  );
  assert.equal(
    schema.accountSchema.safeParse({
      ...personal,
      email: "real@example.com",
      password: "Fixture@1234",
    }).success,
    false,
  );
  for (const patch of [
    { declarations: ["true", false, true, false] },
    { signatureText: " " },
    { signedDate: "2026-02-31" },
    { contentVersion: "approved" },
    { preferredPaymentMethod: "" },
  ])
    assert.equal(
      schema.applicationSchema.safeParse(application(patch)).success,
      false,
    );
});
test("T40 individual/family journeys validate conditional households and actual dates", () => {
  const member = { fullName: "Synthetic Child", dateOfBirth: "2018-02-01" };
  assert.equal(
    schema.applicationSchema.safeParse(
      application({ membershipType: "family" }),
    ).success,
    false,
  );
  assert.equal(
    schema.applicationSchema.safeParse(
      application({ membershipType: "family", householdMembers: [member] }),
    ).success,
    true,
  );
  assert.equal(
    schema.applicationSchema.safeParse(
      application({ householdMembers: [member] }),
    ).success,
    false,
  );
  assert.equal(schema.validDate("2024-02-29"), true);
  assert.equal(schema.validDate("2023-02-29"), false);
  assert.equal(schema.validDate("2999-01-01"), false);
});
test("T40 preview never renders for production, public hosts, disabled flags or nonlocal APIs", () => {
  const { registrationPreview } = load("registration-preview");
  const env = {
    NODE_ENV: "development",
    T40_DEVELOPMENT_PREVIEW: "true",
    NEXT_PUBLIC_API_URL: "http://localhost:3040/api/v1",
  };
  assert.ok(registrationPreview(env, "localhost:2025"));
  assert.equal(
    registrationPreview({ ...env, NODE_ENV: "production" }, "localhost:2025"),
    null,
  );
  assert.equal(registrationPreview(env, "public.example"), null);
  assert.equal(
    registrationPreview(
      { ...env, T40_DEVELOPMENT_PREVIEW: "false" },
      "localhost:2025",
    ),
    null,
  );
  assert.equal(
    registrationPreview(
      { ...env, NEXT_PUBLIC_API_URL: "https://api.example/api/v1" },
      "localhost:2025",
    ),
    null,
  );
  assert.equal(
    registrationPreview(env, "localhost:2025").fixtureSubmissions,
    false,
  );
});
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("T40 session serializes refresh and retains the exact request/key across the retry", async () => {
  let refreshes = 0;
  const calls = [];
  const context = { memberId: "fixture-member" };
  const { RegistrationSession } = load("registration-session", {
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/auth/login")) return json({ accessToken: "old" });
      if (url.endsWith("/auth/refresh")) {
        refreshes++;
        assert.deepEqual(JSON.parse(init.body), { memberId: "fixture-member" });
        assert.equal(init.credentials, "include");
        await new Promise((r) => setTimeout(r, 5));
        return json({ accessToken: "new" });
      }
      if (url.endsWith("/membership/application") && calls.length === 2)
        return json(context);
      if (init.headers.Authorization === "Bearer old") return json({}, 401);
      return json({ received: true });
    },
  });
  const session = new RegistrationSession("http://localhost:3040/api/v1");
  await session.login("fixture@example.invalid", "Fixture@1234");
  await Promise.all([
    session.request("/membership/apply", {
      method: "POST",
      headers: { "Idempotency-Key": "fixture-key" },
      body: '{"fixture":true}',
    }),
    session.request("/membership/application"),
  ]);
  assert.equal(refreshes, 1);
  const retry = calls.find(
    (call) =>
      call.url.endsWith("/membership/apply") &&
      call.init.headers.Authorization === "Bearer new",
  );
  assert.equal(retry.init.headers["Idempotency-Key"], "fixture-key");
  assert.equal(retry.init.body, '{"fixture":true}');
  assert.ok(calls.every((call) => call.init.cache === "no-store"));
  session.clear();
  await assert.rejects(session.request("/membership/application"), /Sign in/);
});
test("T40 refresh failure clears the memory session without persisting secrets", async () => {
  let login = true;
  const { RegistrationSession } = load("registration-session", {
    fetch: async (url) => {
      if (url.endsWith("/auth/login")) return json({ accessToken: "old" });
      if (login) {
        login = false;
        return json({ memberId: "fixture-member" });
      }
      return json({}, 401);
    },
  });
  const session = new RegistrationSession("http://localhost:3040/api/v1");
  await session.login("fixture@example.invalid", "Fixture@1234");
  await assert.rejects(
    session.request("/membership/application"),
    /session ended/,
  );
  await assert.rejects(session.request("/membership/application"), /Sign in/);
});
test("T40 a late refresh or login cannot restore a cleared session", async () => {
  let resolveRefresh, refreshStarted;
  const started = new Promise((resolve) => {
    refreshStarted = resolve;
  });
  let first = true;
  const { RegistrationSession } = load("registration-session", {
    fetch: async (url) => {
      if (url.endsWith("/auth/login")) return json({ accessToken: "old" });
      if (url.endsWith("/auth/refresh")) {
        refreshStarted();
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      }
      if (first) {
        first = false;
        return json({ memberId: "fixture-member" });
      }
      return json({}, 401);
    },
  });
  const session = new RegistrationSession("http://localhost:3040/api/v1");
  await session.login("fixture@example.invalid", "Fixture@1234");
  const pending = session.request("/membership/application");
  const rejected = assert.rejects(pending, /session ended/);
  await started;
  session.clear();
  resolveRefresh(json({ accessToken: "late-token" }));
  await rejected;
  await assert.rejects(session.request("/membership/application"), /Sign in/);
  let resolveLogin;
  const otherModule = load("registration-session", {
    fetch: () =>
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
  });
  const other = new otherModule.RegistrationSession(
    "http://localhost:3040/api/v1",
  );
  const login = other.login("fixture@example.invalid", "Fixture@1234");
  const loginRejected = assert.rejects(login, /session ended/);
  other.clear();
  resolveLogin(json({ accessToken: "late-login" }));
  await loginRejected;
  await assert.rejects(other.request("/membership/application"), /Sign in/);
});
