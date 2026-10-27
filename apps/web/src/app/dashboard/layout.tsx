import type { Metadata } from "next";
import { headers } from "next/headers";
import { DashboardProvider } from "@/components/dashboard/dashboard-provider";
import { dashboardConfig } from "@/lib/dashboard-display";
export const metadata: Metadata = {
  title: "Member dashboard",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = dashboardConfig(
    process.env,
    (await headers()).get("host") ?? "",
  );
  if (!config)
    return (
      <section className="container section">
        <h1>Member dashboard</h1>
        <p>
          Member sign-in is currently unavailable. No account information is
          loaded.
        </p>
      </section>
    );
  return <DashboardProvider {...config}>{children}</DashboardProvider>;
}
