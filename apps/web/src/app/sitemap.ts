import type { MetadataRoute } from "next";
import { navigation } from "@/lib/content";
import { siteUrl } from "@/lib/seo";
export default function sitemap(): MetadataRoute.Sitemap {
  if (!siteUrl) return [];
  return navigation.map(({ href }) => ({
    url: new URL(href, siteUrl).href,
    changeFrequency: "monthly",
    priority: href === "/" ? 1 : 0.7,
  }));
}
