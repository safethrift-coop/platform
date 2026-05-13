export function loanApprovedTemplate(
  firstName: string,
  principalAmount: number,
  monthlyInstalment: number,
  termMonths: number,
  maturityDate: Date,
): { subject: string; html: string } {
  const formattedMaturity = maturityDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    subject: 'Your Safethrift interest-free loan has been approved',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #185FA5;">Loan approved, ${firstName}</h1>
        <p>Your interest-free loan application has been approved.</p>

        <div style="background: #f5f5f5; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <p><strong>Loan amount:</strong> £${principalAmount.toFixed(2)}</p>
          <p><strong>Monthly repayment:</strong> £${monthlyInstalment.toFixed(2)}</p>
          <p><strong>Term:</strong> ${termMonths} months</p>
          <p><strong>Final repayment:</strong> ${formattedMaturity}</p>
          <p><strong>Interest rate:</strong> 0% — no interest, ever</p>
        </div>

        <p>
          Log in to your Safethrift account to view your full repayment schedule
          and make your first repayment.
        </p>

        <p style="color: #666; font-size: 12px;">
          Safethrift is a member-owned, interest-free financial cooperative.
        </p>
      </div>
    `,
  };
}
