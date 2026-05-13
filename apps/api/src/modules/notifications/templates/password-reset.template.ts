export function passwordResetTemplate(
  firstName: string,
  resetUrl: string,
): { subject: string; html: string } {
  return {
    subject: 'Reset your Safethrift password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #185FA5;">Password reset request</h1>
        <p>Hello ${firstName},</p>
        <p>We received a request to reset your Safethrift password. Click the button below to set a new password.</p>
        <p>
          <a href="${resetUrl}"
             style="display: inline-block; background: #185FA5; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Reset my password
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          This link expires in 1 hour. If you did not request a password reset, please ignore this email.
          Your password will not change.
        </p>
      </div>
    `,
  };
}
