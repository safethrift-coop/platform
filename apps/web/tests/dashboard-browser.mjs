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
const output = process.env.TEST_ARTIFACTS_DIR ?? "/tmp/safethrift-t41-browser";
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), "safethrift-t41-chrome-"));
const fixture = fork(
  new URL("../../api/test/fixtures/t41-browser-server.mjs", import.meta.url),
  {
    env: { ...process.env, NODE_ENV: "test" },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  },
);
const fixtureData = await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error("Fixture API startup timeout")),
    20000,
  );
  fixture.on("message", (message) => {
    if (message.type === "ready") {
      clearTimeout(timer);
      resolve(message);
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
      T41_LOCAL_SIMULATION_PREVIEW: "true",
    },
    stdio: ["ignore", "inherit", "inherit"],
  },
);
let ready = false;
for (let attempt = 0; attempt < 150; attempt++) {
  try {
    if ((await fetch("http://localhost:2025/dashboard")).ok) {
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
    for (let i = 0; i < 300; i++) {
      if (await evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      "Timed out waiting for browser state: " +
        expression +
        "\n" +
        (await evaluate("document.body.innerText")),
    );
  }

  const urls = [];
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Network.requestWillBeSent")
      urls.push(message.params.request.url);
  });
  await cdp("Network.enable");
  async function fill(id, value) {
    await evaluate(
      `(()=>{const input=document.getElementById(${JSON.stringify(id)});if(!input)throw new Error('Missing input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  }
  async function click(text) {
    const found = await evaluate(
      `(()=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===${JSON.stringify(text)});if(!button||button.matches(':disabled'))return false;button.click();return true;})()`,
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
  async function gate(enabled) {
    const id = randomUUID();
    await new Promise((resolve) => {
      const listener = (message) => {
        if (message.type === "gate" && message.id === id) {
          fixture.off("message", listener);
          resolve();
        }
      };
      fixture.on("message", listener);
      fixture.send({ type: "gate", id, enabled });
    });
  }
  async function signIn(email = fixtureData.email) {
    await waitText("Sign in to your dashboard");
    await fill("dashboard-email", email);
    await fill("dashboard-password", fixtureData.password);
    await click("Sign in");
  }
  async function navigate(href) {
    await evaluate(`document.querySelector('a[href="${href}"]').click()`);
  }
  await cdp("Page.navigate", { url: "http://localhost:2025/dashboard" });
  await waitText("Sign in to your dashboard");
  await accessibility("sign in");
  await evaluate("document.getElementById('dashboard-email').focus()");
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
    "dashboard-password",
  );

  assert.equal(
    await evaluate("document.body.innerText.includes('123')"),
    false,
  );
  await evaluate(
    `(()=>{const original=window.fetch.bind(window);let fail=true;window.fetch=async(url,init)=>{if(String(url).endsWith('/accounts/overview')&&fail){fail=false;await new Promise(resolve=>setTimeout(resolve,700));return new Response('{}',{status:503});}return original(url,init);};})()`,
  );
  await signIn();
  await waitText("Loading dashboard");
  await waitText("The result could not be confirmed");
  await accessibility("dashboard error");
  await click("Retry dashboard");
  await waitText("Active savings accounts");
  await waitText("£100.00");
  await waitText("Low");
  await accessibility("overview");
  await screen("t41-overview");
  assert.equal(await evaluate("localStorage.length+sessionStorage.length"), 0);
  await navigate("/dashboard/accounts/" + fixtureData.accountId);
  await waitText("Transaction history");
  await waitText("Deposit form");
  await accessibility("disabled account");
  await screen("t41-disabled-account");
  assert.equal(
    await evaluate(
      "document.getElementById('deposit-amount').disabled || document.getElementById('deposit-amount').closest('fieldset').disabled",
    ),
    true,
  );
  await evaluate(
    `(()=>{const original=window.fetch.bind(window);let fail=true;window.fetch=async(url,init)=>{if(String(url).includes('/transactions?cursor=')&&fail){fail=false;throw new TypeError('Synthetic page failure');}return original(url,init);};})()`,
  );
  await click("Load More");
  await waitText("Loaded transactions are retained.");
  assert.equal(await evaluate("document.querySelectorAll('li').length"), 20);
  await accessibility("history page error");
  await click("Retry Load More");
  await waitFor(
    "!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Load More')",
  );
  await waitFor("document.querySelectorAll('li').length === 25");
  assert.equal(await evaluate("document.querySelectorAll('li').length"), 25);
  await waitFor("document.activeElement.hasAttribute('data-transaction-id')");
  await gate(true);
  await navigate("/dashboard");
  await waitText("Active savings accounts");
  await navigate("/dashboard/accounts/" + fixtureData.accountId);
  await waitText("Transaction history");
  await waitFor(
    "!document.getElementById('deposit-amount').closest('fieldset').disabled",
  );
  await click("Simulate deposit");
  await waitText("Enter an amount");
  await fill("deposit-amount", "1.25");
  // Commit the first POST but drop its response. UI must retain body/key for replay.
  await evaluate(
    `(()=>{const original=window.fetch.bind(window);window.t41Posts=[];let lose=true;window.fetch=async(url,init)=>{if(String(url).endsWith('/deposit')){window.t41Posts.push({body:init.body,key:init.headers['Idempotency-Key']});const response=await original(url,init);if(lose){lose=false;throw new TypeError('Synthetic lost response');}return response;}return original(url,init);};})()`,
  );
  await click("Simulate deposit");
  await waitText("The result is not yet confirmed");
  assert.equal(
    await evaluate("document.getElementById('deposit-amount').readOnly"),
    true,
  );
  await waitFor(
    "Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Retry unchanged deposit simulation' && !b.matches(':disabled'))",
  );
  await click("Retry unchanged deposit simulation");
  await waitText("Simulation recorded: £1.25");
  await waitText("£101.25");
  assert.equal(
    await evaluate(
      "window.t41Posts.length===2 && window.t41Posts[0].body===window.t41Posts[1].body && window.t41Posts[0].key===window.t41Posts[1].key",
    ),
    true,
  );
  await waitFor(
    "!document.getElementById('withdrawal-amount').closest('fieldset').disabled",
  );
  await fill("withdrawal-amount", "0.25");
  await click("Simulate withdrawal");
  await waitText("Simulation recorded: £0.25");
  await waitText("£101.00");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await accessibility("mobile account");
  await screen("t41-account-mobile");
  await navigate("/dashboard");
  await waitText("Active savings accounts");
  await waitText("124");
  await navigate("/dashboard/accounts/" + fixtureData.gsaId);
  await waitText("Goal savings (GSA)");
  await waitText("Withdrawal form");
  assert.equal(
    await evaluate(
      "document.getElementById('withdrawal-amount').closest('fieldset').disabled",
    ),
    true,
  );
  // Revoke server gate while page is stale: forged/stale enabled control still fails.
  await gate(false);
  await fill("deposit-amount", "1.00");
  await click("Simulate deposit");
  await waitText("This account or operation is not permitted.");
  await click("Sign out");
  await signIn(fixtureData.pendingEmail);
  await waitText("This account or operation is not permitted.");
  await navigate("/dashboard");
  await waitText("No active savings accounts");
  await waitText("Not yet scored");
  await waitText("Membership is pending");
  await accessibility("pending empty state");
  await screen("t41-pending-mobile");
  await click("Sign out");
  await waitText("Sign in to your dashboard");
  await cdp("Page.navigate", {
    url: "http://localhost:2025/dashboard/accounts/" + fixtureData.accountId,
  });
  await waitText("Sign in to your dashboard");
  assert.equal(await evaluate("localStorage.length+sessionStorage.length"), 0);
  assert.ok(
    urls.every(
      (url) =>
        !url.includes(fixtureData.email) &&
        !url.includes(fixtureData.password) &&
        !url.includes("accessToken="),
    ),
  );
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        overview: true,
        keyboard: true,
        loadingAndReadError: true,
        loadMoreErrorRetainsRows: true,
        ownedAccount: true,
        pagination: true,
        disabledGate: true,
        lostResponseReplay: true,
        unchangedKeyAndBody: true,
        withdrawal: true,
        gsaGuard: true,
        runtimeGateRevocation: true,
        pendingEmptyUnscored: true,
        reloadRequiresLogin: true,
        browserStorageEntries: 0,
        axeViolations: 0,
        mobileOverflow: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: T41 protected dashboard, history, disabled gates, unchanged uncertain replay, synthetic mutations, GSA, pending state, mobile and axe.",
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
  if (fixture.exitCode !== 0)
    throw new Error(
      "T41 synthetic API fixture cleanup did not complete successfully",
    );
}
