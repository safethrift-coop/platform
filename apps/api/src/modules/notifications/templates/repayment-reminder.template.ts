export function repaymentReminderTemplate(
  firstName: string,
  amountDue: number,
  dueDate: Date,
): { subject: string; html: string } {
  const formattedDate = dueDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    subject: `Repayment reminder — £${amountDue.toFixed(2)} due ${formattedDate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #185FA5;">Repayment reminder</h1>
        <p>Hello ${firstName},</p>
        <p>This is a friendly reminder that your next loan repayment is due.</p>

        <div style="background: #f5f5f5; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <p><strong>Amount due:</strong> £${amountDue.toFixed(2)}</p>
          <p><strong>Due date:</strong> ${formattedDate}</p>
        </div>

        <p>
          Log in to your Safethrift account to make your repayment.
          Repaying on time helps build your savings points and improves your
          eligibility for future support.
        </p>

        <p>
          If you are struggling to make this repayment, please contact us
          at <a href="mailto:hello@safethrift.coop">hello@safethrift.coop</a>
          before the due date. We are here to help.
        </p>
      </div>
    `,
  };
}
