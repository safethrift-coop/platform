import type { Metadata } from "next";

// Build-time settings. Leave unset for local development and unapproved previews.
export function getSiteUrl(value = process.env.SITE_URL): URL | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname === "[::1]" ||
    /^127\./.test(url.hostname) ||
    url.hostname === "0.0.0.0" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "SITE_URL must be an HTTPS origin without credentials, path, query or fragment.",
    );
  }
  return url;
}

export const siteUrl = getSiteUrl();
export const indexingEnabled =
  Boolean(siteUrl) && process.env.SITE_INDEXING_ENABLED === "true";

export function pageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  const url = siteUrl ? new URL(path, siteUrl).href : undefined;
  const image = siteUrl ? new URL("/opengraph-image", siteUrl).href : undefined;
  return {
    title,
    description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      title: `${title} | Safethrift`,
      description,
      siteName: "Safethrift",
      locale: "en_GB",
      type: "website",
      ...(url ? { url } : {}),
      ...(image
        ? {
            images: [
              {
                url: image,
                width: 1200,
                height: 630,
                alt: "Safethrift — Community-Owned, Interest-Free Finance for All",
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: `${title} | Safethrift`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
