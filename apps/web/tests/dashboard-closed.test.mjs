import assert from "node:assert/strict";
import { test } from "node:test";
const origin = process.env.TEST_BASE_URL ?? "http://localhost:2025";
for (const path of [
  "/dashboard",
  "/dashboard/accounts/test-account",
  "/dashboard/loans",
  "/dashboard/loans/apply",
  "/dashboard/loans/test-loan",
  "/dashboard/loans/applications/test-application",
  "/dashboard/loan-review",
])
  test(
    "T41 private route " + path + " never serves authenticated data in HTML",
    async () => {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /noindex/);
      assert.match(html, /no-referrer/);
      assert.ok(
        html.includes("Sign in to your dashboard") ||
          html.includes("Member sign-in is currently unavailable"),
      );
      assert.doesNotMatch(
        html,
        /Points are not cash earnings|Recorded balance —|Idempotency-Key/,
      );
      assert.match(response.headers.get("cache-control"), /no-store|private/);
    },
  );
