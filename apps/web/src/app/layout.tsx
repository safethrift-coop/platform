import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Safethrift — Community-Owned, Interest-Free Finance",
    template: "%s | Safethrift",
  },
  description:
    "Member-owned, interest-free financial cooperative. Turn savings into opportunity, without exploitation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
