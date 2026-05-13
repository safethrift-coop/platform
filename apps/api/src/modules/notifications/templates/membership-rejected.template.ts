export function membershipRejectedTemplate(
  firstName: string,
  reason?: string,
): { subject: string; html: string } {
  return {
    subject: 'Update on your Safethrift membership application',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #185FA5;">Update on your application</h1>
        <p>Hello ${firstName},</p>
        <p>
          Thank you for applying to join Safethrift. After careful review,
          we are unable to approve your membership application at this time.
        </p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>
          You are welcome to reapply in the future. If you believe this decision
          was made in error or would like to discuss your application,
          please contact us at <a href="mailto:hello@safethrift.coop">hello@safethrift.coop</a>.
        </p>
        <p style="color: #666; font-size: 12px;">
          Safethrift is a member-owned, interest-free financial cooperative.
        </p>
      </div>
    `,
  };
}
