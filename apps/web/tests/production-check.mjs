import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const port = process.env.TEST_PORT ?? "2026";
const origin = `http://localhost:${port}`;
const server = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "start", "--port", port],
  { stdio: "inherit" },
);
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Server exited: ${server.exitCode}`);
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Server starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Production server did not become ready");
  const tests = spawn(
    process.execPath,
    ["--test", "tests/public-site.test.mjs", "tests/seo-config.test.mjs"],
    { stdio: "inherit", env: { ...process.env, TEST_BASE_URL: origin } },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    tests.once("error", reject);
    tests.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  server.kill("SIGTERM");
}
