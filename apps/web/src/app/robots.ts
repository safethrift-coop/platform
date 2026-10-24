import type { MetadataRoute } from "next";
import { indexingEnabled, siteUrl } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: indexingEnabled
      ? { userAgent: "*", allow: "/" }
      : { userAgent: "*", disallow: "/" },
    ...(indexingEnabled && siteUrl
      ? { sitemap: new URL("/sitemap.xml", siteUrl).href }
      : {}),
  };
}
