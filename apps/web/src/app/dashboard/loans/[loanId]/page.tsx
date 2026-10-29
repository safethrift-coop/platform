import { LoanDetail } from "@/components/loans/loan-views";
export default async function Page({
  params,
}: {
  params: Promise<{ loanId: string }>;
}) {
  const { loanId } = await params;
  return <LoanDetail key={loanId} loanId={loanId} />;
}
