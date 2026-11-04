import type { Prisma } from '@prisma/client';
import type { ReminderEmail } from './reminder-email.provider';

export const scheduleInclude = {
  loan: {
    select: {
      memberId: true,
      loanStatus: true,
      disbursementDate: true,
      member: {
        select: {
          firstName: true,
          email: true,
          emailVerified: true,
          phoneNumber: true,
          phoneVerifiedAt: true,
          phoneVerificationSource: true,
          smsReminderPermissionAt: true,
          smsReminderPermissionSource: true,
          smsReminderPermissionRevokedAt: true,
          membershipStatus: true,
        },
      },
    },
  },
} satisfies Prisma.RepaymentScheduleInclude;
export type Installment = Prisma.RepaymentScheduleGetPayload<{
  include: typeof scheduleInclude;
}>;
export const TERMINAL_DELIVERY = [
  'provider_accepted',
  'delivered',
  'bounced',
  'simulated',
  'skipped',
  'failed',
] as const;
export const IDEMPOTENCY_SAFE_MS = 23 * 60 * 60 * 1000;
export interface SmsPayload {
  to: string;
  body: string;
  statusCallback: string;
}
export function utcDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
export function eligible(row: Installment, date: Date): boolean {
  return (
    row.dueDate < utcDate(date) &&
    row.totalDue.gt(row.totalPaid) &&
    ['due', 'partial', 'late', 'missed'].includes(row.status) &&
    row.loan.loanStatus === 'active' &&
    row.loan.disbursementDate !== null &&
    row.loan.member.membershipStatus === 'active' &&
    row.loan.member.emailVerified
  );
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function overdueEmail(
  row: Installment,
  now: Date,
  reminderId?: string,
): ReminderEmail {
  const amount = row.totalDue.minus(row.totalPaid).toFixed(2);
  const due = row.dueDate.toISOString().slice(0, 10);
  return {
    ...(reminderId
      ? { tags: [{ name: 't36_reminder_id', value: reminderId }] }
      : {}),
    from: process.env.RESEND_FROM_EMAIL ?? 'hello@safethrift.coop',
    to: row.loan.member.email,
    subject: `Overdue repayment reminder — due ${due}`,
    html: `<p>Hello ${escape(row.loan.member.firstName)},</p><p>Our records as of ${now.toISOString()} show an outstanding installment of £${amount}, due ${due} (UTC).</p><p>If you have already arranged repayment, or need support, please contact hello@safethrift.coop.</p>`,
  };
}

export const isE164 = (value: string) => /^\+[1-9]\d{7,14}$/.test(value);

export function smsEligible(member: {
  phoneNumber: string;
  phoneVerifiedAt: Date | null;
  phoneVerificationSource: string | null;
  smsReminderPermissionAt: Date | null;
  smsReminderPermissionSource: string | null;
  smsReminderPermissionRevokedAt: Date | null;
}) {
  return (
    isE164(member.phoneNumber) &&
    member.phoneVerifiedAt !== null &&
    Boolean(member.phoneVerificationSource?.trim()) &&
    member.smsReminderPermissionAt !== null &&
    Boolean(member.smsReminderPermissionSource?.trim()) &&
    member.smsReminderPermissionRevokedAt === null
  );
}

export function renewalWindow(expiresOn: Date, scanDate: Date): 30 | 7 | null {
  const milliseconds =
    utcDate(expiresOn).getTime() - utcDate(scanDate).getTime();
  const days = milliseconds / 86400000;
  return days === 30 || days === 7 ? days : null;
}

export function renewalEmail(
  member: { firstName: string; email: string },
  expiresOn: Date,
  window: 30 | 7,
  reminderId: string,
): ReminderEmail {
  const expiry = expiresOn.toISOString().slice(0, 10);
  return {
    tags: [{ name: 't36_reminder_id', value: reminderId }],
    from: process.env.RESEND_FROM_EMAIL ?? 'hello@safethrift.coop',
    to: member.email,
    subject: `Membership record reminder — ${window} days`,
    html: `<p>Hello ${escape(member.firstName)},</p><p>Our records show a membership expiry date of ${expiry} (UTC), which is ${window} days away.</p><p>This is an administrative reminder only. It does not change your membership status or create a payment obligation. If the date is incorrect, please contact hello@safethrift.coop.</p>`,
  };
}

export function overdueSms(row: Installment, reminderId: string): SmsPayload {
  const amount = row.totalDue.minus(row.totalPaid).toFixed(2);
  const due = row.dueDate.toISOString().slice(0, 10);
  return {
    to: row.loan.member.phoneNumber,
    body: `Safethrift records show an outstanding installment of £${amount}, due ${due} UTC. This is an administrative reminder. Contact hello@safethrift.coop if incorrect.`,
    statusCallback: callbackUrl(reminderId),
  };
}

export function renewalSms(
  member: { phoneNumber: string },
  expiresOn: Date,
  window: 30 | 7,
  reminderId: string,
): SmsPayload {
  const expiry = expiresOn.toISOString().slice(0, 10);
  return {
    to: member.phoneNumber,
    body: `Safethrift records show a membership expiry date of ${expiry} UTC, ${window} days away. This reminder does not change membership status. Contact hello@safethrift.coop if incorrect.`,
    statusCallback: callbackUrl(reminderId),
  };
}

function callbackUrl(reminderId: string) {
  const base = process.env.T36_TWILIO_STATUS_CALLBACK_URL;
  if (!base) throw new Error('Twilio status callback is not configured');
  const url = new URL(base);
  url.searchParams.set('reminderId', reminderId);
  return url.toString();
}

export function smsPayload(json: Prisma.JsonValue | null): SmsPayload {
  if (!json || typeof json !== 'object' || Array.isArray(json))
    throw new Error('Invalid frozen SMS payload');
  const { to, body, statusCallback } = json;
  if (
    typeof to !== 'string' ||
    !isE164(to) ||
    typeof body !== 'string' ||
    !body ||
    body.length > 1000 ||
    typeof statusCallback !== 'string' ||
    !statusCallback.startsWith('https://')
  )
    throw new Error('Invalid frozen SMS payload');
  return { to, body, statusCallback };
}
export function emailPayload(json: Prisma.JsonValue | null): ReminderEmail {
  if (!json || typeof json !== 'object' || Array.isArray(json))
    throw new Error('Invalid frozen reminder payload');
  const { from, to, subject, html } = json;
  if (![from, to, subject, html].every((s) => typeof s === 'string'))
    throw new Error('Invalid frozen reminder payload');
  const tags = json.tags;
  if (
    tags !== undefined &&
    (!Array.isArray(tags) ||
      tags.some(
        (tag) =>
          !tag ||
          typeof tag !== 'object' ||
          Array.isArray(tag) ||
          typeof tag.name !== 'string' ||
          typeof tag.value !== 'string',
      ))
  )
    throw new Error('Invalid frozen reminder tags');
  return {
    ...(tags ? { tags: tags as { name: string; value: string }[] } : {}),
    from: from as string,
    to: to as string,
    subject: subject as string,
    html: html as string,
  };
}
