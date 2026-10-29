import { isolatedWeb } from "./helpers/isolated-web.mjs";
import { launchChrome } from "./helpers/chrome.mjs";
import assert from "node:assert/strict";
import { spawn, fork } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axe = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const output = process.env.TEST_ARTIFACTS_DIR ?? "/tmp/safethrift-t42-browser";
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), "safethrift-t42-chrome-"));
const fixture = fork(
  new URL("../../api/test/fixtures/t42-browser-server.mjs", import.meta.url),
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
const preview = await isolatedWeb();
const web = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "localhost",
    "--port",
    "2042",
  ],
  {
    cwd: preview.directory,
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_PUBLIC_API_URL: "http://localhost:3042/api/v1",
      T41_LOCAL_SIMULATION_PREVIEW: "true",
    },
    stdio: ["ignore", "inherit", "inherit"],
  },
);
let ready = false;
for (let attempt = 0; attempt < 150; attempt++) {
  try {
    if (web.exitCode !== null) throw new Error("Isolated frontend exited");
    if ((await fetch("http://localhost:2042/dashboard")).ok) {
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
  async function signIn(email = fixtureData.email) {
    await waitText("Sign in to your dashboard");
    await waitFor(
      "Boolean(document.getElementById('dashboard-email') && !document.getElementById('dashboard-email').disabled)",
    );
    await fill("dashboard-email", email);
    await fill("dashboard-password", fixtureData.password);
    await click("Sign in");
  }
  async function navigate(href) {
    await waitFor(`Boolean(document.querySelector('a[href="${href}"]'))`);
    await evaluate(`document.querySelector('a[href="${href}"]').click()`);
  }
  const financialRequests = [];
  ws.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);
    if (
      event.method === "Network.requestWillBeSent" &&
      ["POST", "PATCH", "DELETE"].includes(event.params.request.method) &&
      /\/loans(?:\/|$)/.test(event.params.request.url)
    )
      financialRequests.push(event.params.request.url);
  });
  await cdp("Page.navigate", {
    url: "http://localhost:2042/dashboard/loans/" + fixtureData.loanId,
  });
  await waitText("Sign in to your dashboard");
  await accessibility("direct loan sign in");
  await signIn();
  await waitText("Recorded principal");
  await waitText("20 records loaded.");
  await accessibility("loan detail");
  assert.equal(
    await evaluate(
      "document.getElementById('repayment-amount').matches(':disabled')",
    ),
    true,
  );
  await evaluate("document.querySelector('form fieldset button').click()");
  await click("Load More");
  await waitText("25 records loaded. End of records.");
  await screen("loan-detail");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await accessibility("mobile loan detail");
  await screen("loan-mobile");
  await navigate("/dashboard/loans");
  await waitText("My loan applications");
  await waitText("Loan from");
  await accessibility("loan discovery");
  await navigate("/dashboard/loans/applications/" + fixtureData.applicationId);
  await waitText("Application status");
  await waitText("View recorded loan");
  await accessibility("application status");
  await navigate("/dashboard/loans");
  await navigate("/dashboard/loans/apply");
  await waitText("Current risk band");
  assert.equal(
    await evaluate(
      "document.getElementById('loan-slider').matches(':disabled') && document.getElementById('loan-amount').matches(':disabled') && document.getElementById('loan-purpose').matches(':disabled')",
    ),
    true,
  );
  await evaluate("document.querySelector('form fieldset button').click()");
  await accessibility("disabled loan application");
  await screen("application-mobile");
  await navigate("/dashboard/loans");
  await waitText("Loan application review queue");
  await navigate("/dashboard/loan-review");
  await waitText("Application-time repayment probability");
  await waitText("Unavailable");
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('dd')].filter(x=>x.textContent==='0').length >= 2",
    ),
    true,
  );
  await accessibility("review queue");
  await screen("review-mobile");
  await click("Sign out");
  await signIn(fixtureData.pendingEmail);
  await waitText("This account or operation is not permitted.");
  await accessibility("forbidden review queue");
  assert.deepEqual(financialRequests, []);
  assert.equal(
    urls.some((url) => /[?&](email|password|accessToken)=/i.test(url)),
    false,
  );
  assert.equal(await evaluate("localStorage.length+sessionStorage.length"), 0);
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        ownedDiscovery: true,
        directLoanSignIn: true,
        status: true,
        schedule: true,
        repaymentPagination: true,
        disabledApplication: true,
        disabledRepayment: true,
        financialRequests: 0,
        reviewSnapshots: true,
        memberQueueDenied: true,
        axeViolations: 0,
        mobileOverflow: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: T42 owned loan pages, disabled forms, history pagination, reviewer snapshots, member denial, mobile and axe.",
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
  await preview.close();
  if (fixture.exitCode !== 0)
    throw new Error(
      "T41 synthetic API fixture cleanup did not complete successfully",
    );
}
