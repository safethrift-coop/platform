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
