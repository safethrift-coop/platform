import { DashboardAccount } from "@/components/dashboard/dashboard-views";
export default async function Page({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <DashboardAccount key={accountId} accountId={accountId} />;
}
