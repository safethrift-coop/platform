import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/marketing";
import { indexingEnabled, siteUrl } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Safethrift — Community-Owned, Interest-Free Finance",
    template: "%s | Safethrift",
  },
  description:
    "Discover Safethrift’s proposed member-owned cooperative: responsible saving, mutual support and interest-free financial opportunity.",
  robots: { index: indexingEnabled, follow: indexingEnabled },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="announcement">
          A fairer financial future, in the making.{" "}
          <span>Services are not yet available.</span>
        </div>
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
