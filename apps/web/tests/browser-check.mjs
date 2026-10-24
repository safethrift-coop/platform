// Dependency-light browser verification using Chrome's native DevTools protocol.
// Run against a production server: pnpm test:browser. CHROME_BIN may override Chrome.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axe = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const base = process.env.TEST_BASE_URL ?? "http://localhost:2025";
const output = process.env.TEST_ARTIFACTS_DIR ?? "/tmp/safethrift-t39-browser";
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(os.tmpdir(), "safethrift-chrome-"));
const chrome = spawn(
  process.env.CHROME_BIN ?? "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let ws;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = "";
    const timeout = setTimeout(
      () => reject(new Error(`Chrome did not start: ${log}`)),
      15000,
    );
    chrome.once("error", reject);
    chrome.stderr.on("data", (data) => {
      log += data;
      const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
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
    throw new Error(`Timed out: ${expression}`);
  }
  const paths = [
    "/",
    "/about",
    "/products",
    "/membership",
    "/knowledge-centre",
  ];
  async function measureContrast() {
    return evaluate(`(() => {
      function rgb(value) { return (value.match(/[\\d.]+/g) || []).map(Number); }
      function luminance(color) { return color.slice(0,3).map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum,c,i) => sum + c * [.2126,.7152,.0722][i], 0); }
      function ratio(a,b) { const values = [luminance(a),luminance(b)].sort((a,b)=>b-a); return (values[0]+.05)/(values[1]+.05); }
      function background(element) {
        const layers = []; let current = element;
        while (current) { layers.push(rgb(getComputedStyle(current).backgroundColor)); current = current.parentElement; }
        return layers.reverse().reduce((base, color) => { const alpha = color[3] ?? 1; return color.slice(0,3).map((c,i)=>c*alpha+base[i]*(1-alpha)); }, [255,255,255]);
      }
      const styles = new Map(); const failures = [];
      for (const el of document.querySelectorAll('p,h1,h2,h3,h4,dt,dd,a,summary,button,.announcement,.announcement span,.art-card,.art-card strong,.journey-marker > span,.status,.product-kind,.product-code,.art-label,.footer-bottom span,.resource-footnote')) {
        if (!el.getBoundingClientRect().width || !el.textContent.trim()) continue;
        const css = getComputedStyle(el); const foreground = rgb(css.color); const bg = background(el); const size = parseFloat(css.fontSize); const large = size >= 24 || (size >= 18.666 && parseInt(css.fontWeight) >= 700); const minimum = large ? 3 : 4.5;
        const value = ratio(foreground,bg); const selector = el.id ? '#'+el.id : el.tagName.toLowerCase()+[...el.classList].map(c=>'.'+c).join('');
        const sample = { selector, text: el.textContent.trim().slice(0,60), foreground: css.color, background: bg.map(Math.round), fontSize: size, fontWeight: css.fontWeight, ratio: Math.round(value*100)/100, minimum };
        if (value < minimum) failures.push(sample);
        const key = [css.color,bg.join(','),css.fontSize,css.fontWeight].join('|'); if (!styles.has(key)) styles.set(key,sample);
      }
      return { method: 'WCAG relative luminance; sRGB; alpha-composited ancestor background colours. Illustration label backgrounds are explicit solid colours.', failures, samples: [...styles.values()] };
    })()`);
  }
  const results = [];
  const interactionStyles = {};
  for (const width of process.env.TEST_INTERACTIONS_ONLY
    ? []
    : process.env.TEST_VIEWPORTS
      ? process.env.TEST_VIEWPORTS.split(",").map(Number)
      : [320, 375, 390, 768, 1024, 1440, 1920]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const route of paths) {
      await cdp("Page.navigate", { url: new URL(route, base).href });
      await waitFor(
        `location.pathname === ${JSON.stringify(route)} && document.readyState === 'complete' && !!document.querySelector('h1')`,
      );
      assert.equal(
        await evaluate("document.documentElement.scrollWidth <= innerWidth"),
        true,
        `${route} overflow at ${width}`,
      );
      await evaluate(axe);
      const audit = await evaluate(
        "axe.run(document, {runOnly: {type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r => ({violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary,checks:[...n.any,...n.all,...n.none].map(c=>({id:c.id,message:c.message,data:c.data,relatedNodes:c.relatedNodes}))}))}))}))",
      );
      assert.deepEqual(
        audit.violations,
        [],
        `${route} accessibility at ${width}: ${JSON.stringify(audit.violations)}`,
      );
      const contrast = await measureContrast();
      assert.deepEqual(
        contrast.failures,
        [],
        `${route} measured contrast at ${width}: ${JSON.stringify(contrast.failures)}`,
      );
      results.push({ route, width, overflow: false, ...audit, contrast });
      if (width === 390 || width === 1440) {
        const dimensions = await cdp("Page.getLayoutMetrics");
        const screenshot = await cdp("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width,
            height: dimensions.cssContentSize.height,
            scale: 1,
          },
        });
        await writeFile(
          path.join(
            output,
            `${route === "/" ? "home" : route.slice(1)}-${width}.png`,
          ),
          Buffer.from(screenshot.data, "base64"),
        );
      }
    }
  }
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.navigate", { url: base });
  await waitFor(
    "location.pathname === '/' && document.readyState === 'complete'",
  );
  // Allow hydration to attach event handlers; inspect observable state after clicks.
  await evaluate("document.querySelector('.menu-toggle').click()");
  await waitFor(
    "document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true'",
  );
  interactionStyles.expandedMenu = await evaluate(
    "(() => {const s=getComputedStyle(document.querySelector('.menu-toggle'));return {foreground:s.color,background:s.backgroundColor,border:s.borderColor};})()",
  );
  await evaluate(
    "document.querySelector('#site-navigation a[href=\"/about\"]').focus()",
  );
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
    code: "Escape",
  });
  await cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
    code: "Escape",
  });
  await waitFor(
    "document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false'",
  );
  assert.equal(
    await evaluate(
      "document.activeElement === document.querySelector('.menu-toggle')",
    ),
    true,
    "Escape restores focus",
  );
  await evaluate("document.querySelector('.menu-toggle').click()");
  await waitFor(
    "document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true'",
  );
  await evaluate(
    "document.querySelector('#site-navigation a[href=\"/about\"]').click()",
  );
  await waitFor(
    "location.pathname === '/about' && document.querySelector('h1').textContent.includes('Built around people')",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.menu-toggle').getAttribute('aria-expanded')",
    ),
    "false",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('#site-navigation a[aria-current=page]').getAttribute('href')",
    ),
    "/about",
  );
  await cdp("Page.bringToFront");
  await evaluate("document.querySelector('summary').focus()");
  await waitFor("document.activeElement === document.querySelector('summary')");
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: "\r",
    key: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    code: "Enter",
  });
  await cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    code: "Enter",
  });
  await waitFor("document.querySelector('details').open");
  await evaluate("document.querySelector('.skip-link').focus()");
  await cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: "\r",
    key: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    code: "Enter",
  });
  await cdp("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    code: "Enter",
  });
  await waitFor("document.activeElement.id === 'main-content'");
  await cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  assert.equal(
    await evaluate("getComputedStyle(document.documentElement).scrollBehavior"),
    "auto",
  );
  await cdp("Page.navigate", { url: base });
  await waitFor(
    "location.pathname === '/' && document.readyState === 'complete'",
  );
  for (const selector of [
    ".actions .button",
    ".actions .button-secondary",
    ".closing .button",
  ]) {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    const rect = await evaluate(
      `(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    );
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...rect });
    // Reduced motion is active, so hover colours have no transition delay.
    interactionStyles[selector] = await evaluate(
      `(() => {const e=document.querySelector(${JSON.stringify(selector)});const s=getComputedStyle(e);return {foreground:s.color,background:s.backgroundColor};})()`,
    );
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).focus()`,
    );
    interactionStyles[selector].focus = await evaluate(
      `(() => {const e=document.querySelector(${JSON.stringify(selector)});const s=getComputedStyle(e);return {visible:e.matches(':focus-visible'),outline:s.outlineColor,width:s.outlineWidth,offset:s.outlineOffset,surround:s.boxShadow};})()`,
    );
    assert.equal(
      interactionStyles[selector].focus.visible,
      true,
      "Visible keyboard focus",
    );
  }
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        checks: results,
        interactionStyles,
        keyboard: "PASS",
        mobileNavigation: "PASS",
        reducedMotion: "PASS",
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${results.length} route/viewport accessibility and overflow checks; mobile navigation, Escape/focus, FAQ keyboard, skip link, reduced motion. Artifacts: ${output}`,
  );
} finally {
  ws?.close();
  chrome.kill("SIGTERM");
  await new Promise((resolve) =>
    chrome.exitCode !== null ? resolve() : chrome.once("exit", resolve),
  );
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
