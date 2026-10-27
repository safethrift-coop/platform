import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Fresh-profile headless tests do not need the runner's desktop D-Bus session.
export function chromeEnvironment(env = process.env) {
  const result = { ...env };
  delete result.DBUS_SESSION_BUS_ADDRESS;
  return result;
}

export function waitForChrome(
  chrome,
  profile,
  { timeoutMs = 45000, pollMs = 100 } = {},
) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let diagnostic = "";
    let poll;
    let timeout;
    function finish(error, endpoint) {
      if (finished) return;
      finished = true;
      clearTimeout(poll);
      clearTimeout(timeout);
      chrome.removeListener("error", onError);
      chrome.removeListener("exit", onExit);
      chrome.stderr?.removeListener("data", onData);
      if (error) reject(error);
      else resolve(endpoint);
    }
    function failure(reason) {
      return new Error(
        `${reason}\nChrome stderr (last 16 KiB):\n${diagnostic || "(empty)"}`,
      );
    }
    function onError(error) {
      finish(failure(`Chrome launch failed: ${error.message}`));
    }
    function onExit(code, signal) {
      finish(
        failure(
          `Chrome exited before DevTools was ready (code=${code}, signal=${signal})`,
        ),
      );
    }
    function onData(data) {
      diagnostic = (diagnostic + data.toString()).slice(-16384);
      const match = diagnostic.match(
        /DevTools listening on (ws:\/\/[^\s]+)(?=\s)/,
      );
      if (match) {
        try {
          const endpoint = new URL(match[1]);
          if (["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname))
            finish(null, endpoint.href);
        } catch {
          /* Continue waiting for Chrome's active-port file. */
        }
      }
    }
    async function checkActivePort() {
      try {
        const [port, websocketPath] = (
          await readFile(path.join(profile, "DevToolsActivePort"), "utf8")
        )
          .trim()
          .split(/\r?\n/);
        if (
          /^[1-9]\d{0,4}$/.test(port) &&
          Number(port) <= 65535 &&
          /^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(websocketPath)
        ) {
          finish(null, `ws://127.0.0.1:${port}${websocketPath}`);
        }
      } catch {
        /* Chrome writes this file only after the debugging server starts. */
      }
      if (!finished) poll = setTimeout(checkActivePort, pollMs);
    }
    chrome.once("error", onError);
    chrome.once("exit", onExit);
    chrome.stderr?.on("data", onData);
    timeout = setTimeout(
      () =>
        finish(
          failure(`Chrome DevTools startup timed out after ${timeoutMs} ms`),
        ),
      timeoutMs,
    );
    if (chrome.exitCode !== null || chrome.signalCode !== null)
      onExit(chrome.exitCode, chrome.signalCode);
    else void checkActivePort();
  });
}

export function launchChrome(profile) {
  const chrome = spawn(
    process.env.CHROME_BIN ?? "/usr/bin/google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { env: chromeEnvironment(), stdio: ["ignore", "ignore", "pipe"] },
  );
  return { chrome, ready: waitForChrome(chrome, profile) };
}
