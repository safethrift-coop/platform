import { launchChrome } from "./helpers/chrome.mjs";
import assert from "node:assert/strict";
import { spawn, fork } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const axe = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const output = process.env.TEST_ARTIFACTS_DIR ?? "/tmp/safethrift-t40-browser";
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), "safethrift-t40-chrome-"));
const fixture = fork(
  new URL("../../api/test/fixtures/t40-browser-server.mjs", import.meta.url),
  {
    env: { ...process.env, NODE_ENV: "test" },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  },
);
await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error("Fixture API startup timeout")),
    20000,
  );
  fixture.on("message", (message) => {
    if (message.type === "ready") {
      clearTimeout(timer);
      resolve();
    }
  });
  fixture.once("exit", () => reject(new Error("Fixture API exited")));
});
const web = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--hostname",
    "localhost",
    "--port",
    "2025",
  ],
  {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_PUBLIC_API_URL: "http://localhost:3040/api/v1",
      T40_DEVELOPMENT_PREVIEW: "true",
      T40_LOCAL_FIXTURE_SUBMISSIONS: "true",
    },
    stdio: ["ignore", "inherit", "inherit"],
  },
);
let ready = false;
for (let attempt = 0; attempt < 150; attempt++) {
  try {
    if ((await fetch("http://localhost:2025/register")).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!ready) {
  web.kill("SIGTERM");
  fixture.kill("SIGTERM");
  throw new Error("Frontend startup timeout");
}
const { chrome, ready: chromeReady } = launchChrome(profile);
let ws;
try {
  const endpoint = await chromeReady;
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let serial = 0;
  const pending = new Map();
  ws.addEventListener("message", ({ data }) => {
    const result = JSON.parse(data);
    if (result.id && pending.has(result.id)) {
      const { resolve, reject, timeout } = pending.get(result.id);
      clearTimeout(timeout);
      pending.delete(result.id);
      if (result.error) reject(new Error(JSON.stringify(result.error)));
      else resolve(result.result);
    }
  });
  function call(method, params = {}, sessionId) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      pending.set(id, { resolve, reject, timeout });
      ws.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  }
  const { targetId } = await call("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await call("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const cdp = (method, params) => call(method, params, sessionId);
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  async function evaluate(expression) {
    const result = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Timed out waiting for browser state");
  }

  const urls = [];
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Network.requestWillBeSent")
      urls.push(message.params.request.url);
  });
  await cdp("Network.enable");
  const password = "Fixture@1234";
  async function fill(id, value) {
    await evaluate(
      `(()=>{const input=document.getElementById(${JSON.stringify(id)});if(!input)throw new Error('Missing input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  }
  async function click(text) {
    const found = await evaluate(
      `(()=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)});if(!button||button.disabled)return false;button.click();return true;})()`,
    );
    assert.ok(found, "Expected enabled button: " + text);
  }
  async function waitText(text) {
    await waitFor(
      `Boolean(document.body && document.body.innerText.includes(${JSON.stringify(text)}))`,
    );
  }
  async function screen(name) {
    const shot = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await writeFile(
      path.join(output, name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  }
  async function accessibility(name) {
    await evaluate(axe);
    const report = await evaluate(
      `axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(result=>({violations:result.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.map(node=>node.target)}))}))`,
    );
    assert.deepEqual(report.violations, [], name + " accessibility");
    assert.equal(
      await evaluate("document.documentElement.scrollWidth <= innerWidth"),
      true,
      name + " overflow",
    );
  }
  async function code(email) {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Fixture mailbox timeout")),
        5000,
      );
      const listener = (message) => {
        if (message.type === "code" && message.id === id) {
          clearTimeout(timer);
          fixture.off("message", listener);
          resolve(message.code);
        }
      };
      fixture.on("message", listener);
      fixture.send({ type: "code", id, email });
    });
  }
  async function accountAndLogin(email) {
    await cdp("Page.navigate", { url: "http://localhost:2025/register" });
    await waitText("Create your test account");
    await accessibility("account");
    await click("Create account");
    await waitText("Enter a value");
    const fields = {
      firstName: "Fixture",
      lastName: "Only",
      dateOfBirth: "1990-01-01",
      phoneNumber: "+447911123456",
      addressLine1: "Test street",
      addressLine2: "",
      city: "Test city",
      postcode: "SW1A 1AA",
      email,
      password,
    };
    for (const [id, value] of Object.entries(fields)) await fill(id, value);
    await click("Create account");
    await waitText("Verify your account email");
    assert.equal(
      await evaluate(
        "document.body.innerText.includes('No membership application has been submitted.')",
      ),
      true,
    );
    const token = await code(email);
    assert.ok(token);
    await fill("token", token);
    await click("Verify email");
    await waitText("Sign in to continue");
    await fill("password", password);
    await click("Sign in");
    await waitText("Step 1: Personal Details");
    assert.equal(
      await evaluate("document.cookie.includes('refresh_token')"),
      false,
    );
    assert.equal(
      await evaluate("localStorage.length + sessionStorage.length"),
      0,
    );
  }
  const individual = randomUUID() + "@example.invalid";
  await accountAndLogin(individual);
  await accessibility("personal");
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  assert.equal(
    await evaluate("document.activeElement.id"),
    "personalDetails-firstName",
  );
  await click("Continue");
  await waitText("Step 2: Membership Type");
  await click("Continue");
  await waitText("Step 3: Household Members");
  await waitText("Household details are not needed");
  await click("Continue");
  await waitText("Step 4: Additional Information");
  await click("Continue");
  await waitText("Step 5: Declaration");
  await accessibility("declarations");
  await click("Continue");
  await waitText("Step 6: Signature and Date");
  await click("Continue");
  await waitText("Check the highlighted fields");
  await fill("signatureText", "Fixture Only");
  await click("Continue");
  await waitText("Step 7: Payment Method");
  await evaluate(
    "(()=>{const select=document.getElementById('preferredPaymentMethod');select.value='bank_transfer';select.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await accessibility("payment preference");
  await screen("t40-individual-payment");
  await click("Submit synthetic test application");
  await waitText("Await administrative review");
  await accessibility("confirmation");
  await screen("t40-confirmation");
  await click("Sign out and clear this page");
  await waitText("Sign in to continue");
  assert.equal(
    await evaluate("localStorage.length + sessionStorage.length"),
    0,
  );
  // A fresh login recovers the committed receipt rather than offering another form.
  await fill("email", individual);
  await fill("password", password);
  await click("Sign in");
  await waitText("Await administrative review");
  await click("Sign out and clear this page");
  const family = randomUUID() + "@example.invalid";
  await accountAndLogin(family);
  await click("Continue");
  await waitText("Step 2: Membership Type");
  await evaluate("document.querySelector('input[value=family]').click()");
  await click("Continue");
  await waitText("Step 3: Household Members");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await click("Continue");
  await waitText("Check the highlighted fields");
  await fill("householdMembers-0-fullName", "Synthetic Child");
  await fill("householdMembers-0-dateOfBirth", "2018-02-01");
  await accessibility("family mobile");
  await screen("t40-family-mobile");
  await click("Back");
  await waitText("Step 2: Membership Type");
  await evaluate("document.querySelector('input[value=individual]').click()");
  await click("Continue");
  await waitText("Step 3: Household Members");
  assert.equal(
    await evaluate(
      "document.querySelectorAll('input[id^=householdMembers]').length",
    ),
    0,
  );
  await click("Back");
  await waitText("Step 2: Membership Type");
  await evaluate("document.querySelector('input[value=family]').click()");
  await click("Continue");
  await waitText("Step 3: Household Members");
  assert.equal(
    await evaluate(
      "document.getElementById('householdMembers-0-fullName').value",
    ),
    "",
  );
  await fill("householdMembers-0-fullName", "Synthetic Child");
  await fill("householdMembers-0-dateOfBirth", "2018-02-01");
  for (const text of [
    "Step 4: Additional Information",
    "Step 5: Declaration",
    "Step 6: Signature and Date",
  ]) {
    await click("Continue");
    await waitText(text);
  }
  await fill("signatureText", "Fixture Only");
  await click("Continue");
  await waitText("Step 7: Payment Method");
  await evaluate(
    "(()=>{const select=document.getElementById('preferredPaymentMethod');select.value='direct_debit';select.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await click("Submit synthetic test application");
  await waitText("Await administrative review");
  await accessibility("family confirmation");
  assert.equal(
    await evaluate("localStorage.length + sessionStorage.length"),
    0,
  );
  assert.ok(
    urls.every(
      (url) =>
        !url.includes(individual) &&
        !url.includes(family) &&
        !url.includes(password) &&
        !url.includes("?token="),
    ),
  );
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        individual: true,
        family: true,
        conditionalHouseholdCleared: true,
        receiptRecovery: true,
        keyboard: true,
        axeViolations: 0,
        mobileOverflow: false,
        browserStorageEntries: 0,
        sensitiveDataInUrls: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: T40 individual/family browser journeys, verification/login, household clearing, receipt recovery, keyboard, mobile layout, axe and memory-only storage.",
  );
} finally {
  if (ws) ws.close();
  chrome.kill("SIGTERM");
  web.kill("SIGTERM");
  fixture.kill("SIGTERM");
  await Promise.all(
    [chrome, web, fixture].map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 10000);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        }),
    ),
  );
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
