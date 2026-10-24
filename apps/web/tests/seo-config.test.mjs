import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/lib/seo.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText;
function config(env) {
  const context = { exports: {}, process: { env }, URL };
  vm.runInNewContext(source, context);
  return context.exports;
}
test("unconfigured preview omits canonical and remains non-indexable", () => {
  const seo = config({ NODE_ENV: "development" });
  assert.equal(seo.siteUrl, undefined);
  assert.equal(seo.indexingEnabled, false);
  const meta = seo.pageMetadata("About", "Description", "/about");
  assert.equal(meta.openGraph.images, undefined);
  assert.equal(meta.twitter.images, undefined);
  assert.equal(meta.twitter.card, "summary");
  assert.equal(
    seo.pageMetadata("About", "Description", "/about").alternates,
    undefined,
  );
});
test("a verified origin creates correct canonicals and needs explicit indexing approval", () => {
  const seo = config({ SITE_URL: "https://approved.example" });
  assert.equal(seo.indexingEnabled, false);
  assert.equal(
    seo.pageMetadata("About", "Description", "/about").alternates.canonical,
    "https://approved.example/about",
  );
  assert.equal(
    config({
      SITE_URL: "https://approved.example",
      SITE_INDEXING_ENABLED: "true",
    }).indexingEnabled,
    true,
  );
  assert.equal(
    config({ SITE_INDEXING_ENABLED: "true" }).indexingEnabled,
    false,
  );
});
test("invalid or unsafe site origins fail rather than publish misleading URLs", () => {
  for (const SITE_URL of [
    "not-a-url",
    "http://approved.example",
    "https://localhost",
    "https://preview.localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://user:pass@approved.example",
    "https://approved.example/path",
    "https://approved.example?query=yes",
    "https://approved.example#fragment",
  ])
    assert.throws(() => config({ SITE_URL }));
});

test("production and preview without an approved origin omit URL-based social fields", () => {
  for (const env of [
    { NODE_ENV: "production" },
    {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_URL: "unapproved-preview.example",
    },
  ]) {
    const seo = config(env);
    const meta = seo.pageMetadata("About", "Description", "/about");
    assert.equal(seo.indexingEnabled, false);
    assert.equal(meta.alternates, undefined);
    assert.equal(meta.openGraph.url, undefined);
    assert.equal(meta.openGraph.images, undefined);
    assert.equal(meta.twitter.images, undefined);
    assert.ok(!JSON.stringify(meta).includes("localhost"));
  }
});
test("configured previews and approved production use absolute HTTPS social URLs", () => {
  for (const approved of [false, true]) {
    const seo = config({
      NODE_ENV: "production",
      SITE_URL: "https://approved.example",
      SITE_INDEXING_ENABLED: String(approved),
    });
    const meta = seo.pageMetadata("Products", "Description", "/products");
    assert.equal(seo.indexingEnabled, approved);
    assert.equal(meta.openGraph.url, "https://approved.example/products");
    assert.equal(
      meta.openGraph.images[0].url,
      "https://approved.example/opengraph-image",
    );
    assert.equal(
      meta.twitter.images[0],
      "https://approved.example/opengraph-image",
    );
    assert.equal(meta.twitter.card, "summary_large_image");
  }
});
