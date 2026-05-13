// This template is sent when a member registers.
// It contains a link they must click to verify their email.
export function emailVerificationTemplate(
  firstName: string,
  verificationUrl: string,
): { subject: string; html: string } {
  return {
    subject: 'Verify your Safethrift email address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #185FA5;">Welcome to Safethrift, ${firstName}</h1>
        <p>Thank you for registering. Please verify your email address to activate your account.</p>
        <p>
          <a href="${verificationUrl}"
             style="display: inline-block; background: #185FA5; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Verify my email
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          This link expires in 24 hours. If you did not register with Safethrift, please ignore this email.
        </p>
        <p style="color: #666; font-size: 12px;">
          Safethrift is a member-owned, interest-free financial cooperative.
          Registered as a Community Interest Company in England and Wales.
        </p>
      </div>
    `,
  };
}
