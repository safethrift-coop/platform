import assert from "node:assert/strict";
import { test } from "node:test";

const origin = process.env.TEST_BASE_URL ?? "http://localhost:2025";
const configuredOrigin = process.env.TEST_SITE_URL;
const indexable = process.env.TEST_INDEXING_ENABLED === "true";
const paths = ["/", "/about", "/products", "/membership", "/knowledge-centre"];
const pages = new Map();

for (const path of paths) {
  test(`public page ${path} is complete and has unique metadata`, async () => {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200);
    const html = await response.text();
    pages.set(path, html);
    assert.equal((html.match(/<h1(?:\s|>)/g) ?? []).length, 1);
    assert.equal((html.match(/<main(?:\s|>)/g) ?? []).length, 1);
    assert.match(html, /lang="en-GB"/);
    assert.match(html, /href="#main-content"/);
    assert.match(html, /name="description" content="[^"]+"/);
    assert.match(html, /property="og:title"/);
    assert.match(html, /property="og:description"/);
    assert.doesNotMatch(
      html,
      /<meta[^>]+(?:property|name)="(?:og:|twitter:)[^"]+"[^>]+content="[^"]*(?:localhost|127\.0\.0\.1)/,
    );
    if (configuredOrigin) {
      assert.ok(
        html.includes(
          `property="og:image" content="${new URL("/opengraph-image", configuredOrigin).href}"`,
        ),
      );
      assert.match(html, /name="twitter:card" content="summary_large_image"/);
    } else {
      assert.doesNotMatch(html, /(?:property="og:image"|name="twitter:image")/);
      assert.match(html, /name="twitter:card" content="summary"/);
    }
    assert.match(
      html,
      /name="robots" content="(?:index, follow|noindex, nofollow)"/,
    );
    assert.match(html, /Services are not yet available/);
    assert.doesNotMatch(html, /<form(?:\s|>)/);
    assert.doesNotMatch(
      html,
      /href="(?:\/auth|\/register|\/dashboard|\/api|\/login|\/privacy|\/terms)/,
    );
    if (configuredOrigin) {
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
      assert.ok(canonical, "Configured build must publish a canonical URL");
      assert.equal(
        new URL(canonical[1]).href,
        new URL(path, configuredOrigin).href,
      );
    } else assert.doesNotMatch(html, /rel="canonical"/);
    assert.ok(
      html.includes(
        `name="robots" content="${indexable ? "index, follow" : "noindex, nofollow"}"`,
      ),
    );
  });
}

test("all internal navigation, product anchors and metadata are consistent", async () => {
  const titles = [...pages.values()].map(
    (html) => html.match(/<title>(.*?)<\/title>/)?.[1],
  );
  assert.equal(new Set(titles).size, paths.length);
  for (const [path, html] of pages) {
    for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
      const target = new URL(
        href.replaceAll("&amp;", "&"),
        new URL(path, origin),
      );
      assert.equal(
        target.origin,
        new URL(origin).origin,
        "links must use available public routes",
      );
      const targetHtml = pages.get(target.pathname);
      assert.ok(targetHtml, `unknown link ${href} on ${path}`);
      if (target.hash)
        assert.ok(
          targetHtml.includes(`id="${target.hash.slice(1)}"`),
          `missing anchor ${href}`,
        );
    }
  }
  assert.match(pages.get("/products"), /Flexible Savings Account/);
  assert.match(pages.get("/products"), /Regular Savings Account/);
  assert.match(pages.get("/products"), /Goal-Based Savings Account/);
  assert.doesNotMatch(pages.get("/membership"), /£(?:30|50)/);
  for (const category of [
    "Insights &amp; Reports",
    "Member Profiles &amp; Community",
    "Practical Guides &amp; Support Tools",
    "Learning Library",
  ])
    assert.ok(pages.get("/knowledge-centre").includes(category));
});

test("crawl controls, share image and 404 work", async () => {
  const robots = await (await fetch(`${origin}/robots.txt`)).text();
  const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
  assert.ok(robots.includes(indexable ? "Allow: /" : "Disallow: /"));
  if (configuredOrigin) {
    assert.equal((sitemap.match(/<loc>/g) ?? []).length, 5);
    for (const path of paths)
      assert.ok(
        sitemap.includes(`<loc>${new URL(path, configuredOrigin).href}</loc>`),
      );
  } else assert.doesNotMatch(sitemap, /<loc>/);
  if (!indexable) assert.doesNotMatch(robots, /Sitemap:/);
  else
    assert.ok(
      robots.includes(
        `Sitemap: ${new URL("/sitemap.xml", configuredOrigin).href}`,
      ),
    );
  const image = await fetch(`${origin}/opengraph-image`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /image\/png/);
  assert.ok((await image.arrayBuffer()).byteLength > 1000);
  const missing = await fetch(`${origin}/page-that-does-not-exist`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Back to home/);
});

test("rendered stylesheets and JavaScript assets are available", async () => {
  const assets = new Set();
  for (const html of pages.values()) {
    for (const [, asset] of html.matchAll(
      /(?:href|src)="(\/_next\/static\/[^"?]+\.(?:css|js))"/g,
    ))
      assets.add(asset);
  }
  assert.ok(
    [...assets].some((asset) => asset.endsWith(".css")),
    "A styled page must load its stylesheet",
  );
  for (const asset of assets) {
    const response = await fetch(new URL(asset, origin));
    assert.equal(response.status, 200, `Missing production asset: ${asset}`);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
});
