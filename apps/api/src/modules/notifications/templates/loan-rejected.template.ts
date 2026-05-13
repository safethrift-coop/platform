export function loanRejectedTemplate(
  firstName: string,
  reason?: string,
): { subject: string; html: string } {
  return {
    subject: 'Update on your Safethrift loan application',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #185FA5;">Update on your loan application</h1>
        <p>Hello ${firstName},</p>
        <p>
          After careful review of your application, we are unable to approve
          your loan request at this time.
        </p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>
          Keep saving regularly to build your savings points and improve your
          eligibility for future applications.
        </p>
        <p>
          If you have questions, contact us at
          <a href="mailto:hello@safethrift.coop">hello@safethrift.coop</a>.
        </p>
      </div>
    `,
  };
}
