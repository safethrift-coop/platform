import { LoanStatus } from "@/components/loans/loan-views";
export default async function Page({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <LoanStatus key={applicationId} applicationId={applicationId} />;
}
