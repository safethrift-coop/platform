import assert from "node:assert/strict";
import { test } from "node:test";
const origin = process.env.TEST_BASE_URL ?? "http://localhost:2026";
for (const route of ["/register", "/login", "/verify-email"])
  test(`T40 production ${route} remains closed and collects no personal information`, async () => {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Registration is not open yet/);
    assert.match(html, /No applicant information is collected/);
    assert.doesNotMatch(html, /<form(?:\s|>)/);
    assert.doesNotMatch(html, /<input(?:\s|>)/);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.match(html, /name="referrer" content="no-referrer"/);
  });
