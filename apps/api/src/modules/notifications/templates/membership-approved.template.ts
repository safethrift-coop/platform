export function membershipApprovedTemplate(
  firstName: string,
  membershipNumber: string,
  membershipType: string,
  feeAmount: number,
  paymentMethod: string,
): { subject: string; html: string } {
  return {
    subject: 'Your Safethrift membership has been approved',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #185FA5;">Welcome to the Safethrift cooperative, ${firstName}</h1>
        <p>Your membership application has been approved. You are now a member of our cooperative.</p>

        <div style="background: #f5f5f5; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <p><strong>Membership number:</strong> ${membershipNumber}</p>
          <p><strong>Membership type:</strong> ${membershipType}</p>
          <p><strong>Annual fee:</strong> £${feeAmount}</p>
        </div>

        <h2 style="color: #185FA5;">Next step — pay your membership fee</h2>
        <p>Your preferred payment method is <strong>${paymentMethod}</strong>.</p>
        <p>Payment instructions will follow in a separate email within 1 working day.</p>

        <p>Once payment is confirmed, you will have full access to your savings accounts and the Safethrift platform.</p>

        <p style="color: #666; font-size: 12px;">
          Safethrift is a member-owned, interest-free financial cooperative.
          Registered as a Community Interest Company in England and Wales.
        </p>
      </div>
    `,
  };
}
