const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function emailVerificationTemplate(
  firstName: string,
  verificationUrl: string,
  token: string,
): { subject: string; html: string } {
  return {
    subject: 'Verify your Safethrift account email',
    html: `<p>Hello ${escape(firstName)},</p><p>Open the verification page and enter your code:</p><p><a href="${escape(verificationUrl)}">Verify email</a></p><p>${escape(token)}</p><p>The code expires in 24 hours. Email verification does not approve a membership application.</p>`,
  };
}
