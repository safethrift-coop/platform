import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Resend } from 'resend';
import { emailVerificationTemplate } from './templates/email-verification.template';
import { passwordResetTemplate } from './templates/password-reset.template';
import { membershipApprovedTemplate } from './templates/membership-approved.template';
import { membershipRejectedTemplate } from './templates/membership-rejected.template';
import { loanApprovedTemplate } from './templates/loan-approved.template';
import { loanRejectedTemplate } from './templates/loan-rejected.template';
import { repaymentReminderTemplate } from './templates/repayment-reminder.template';

@Injectable()
export class NotificationsService {
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly appUrl: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {
    // Initialise Resend with the API key from environment
    this.resend = new Resend(process.env['RESEND_API_KEY'] ?? '');
    this.fromEmail =
      process.env['RESEND_FROM_EMAIL'] ?? 'hello@safethrift.coop';
    this.appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';
  }

  // Core send method — all other methods call this
  // Having one place to send email means logging, error handling,
  // and any future features (e.g. unsubscribe tracking) are in one place
  private async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    // In development, log the email instead of sending it
    // This prevents accidental emails to real addresses during testing
    if (process.env['NODE_ENV'] !== 'production') {
      this.logger.info('EMAIL (dev — not sent)', {
        to,
        subject,
        preview: html.slice(0, 100),
      });
      return;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        html,
      });

      if (error) {
        this.logger.error('Failed to send email via Resend', {
          to,
          subject,
          error: error.message,
        });
        return;
      }

      this.logger.info('Email sent successfully', { to, subject });
    } catch (err) {
      // We never throw from sendEmail — a failed notification
      // should never crash the main operation (deposit, approval, etc.)
      this.logger.error('Email send threw an exception', {
        to,
        subject,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async sendVerificationEmail(
    email: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const verificationUrl = `${this.appUrl}/verify-email?token=${token}`;
    const { subject, html } = emailVerificationTemplate(
      firstName,
      verificationUrl,
    );
    await this.sendEmail(email, subject, html);
  }

  async sendPasswordResetEmail(
    email: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${token}`;
    const { subject, html } = passwordResetTemplate(firstName, resetUrl);
    await this.sendEmail(email, subject, html);
  }

  async sendMembershipApproved(
    email: string,
    firstName: string,
    membershipNumber: string,
    membershipType: string,
    feeAmount: number,
    paymentMethod: string,
  ): Promise<void> {
    const { subject, html } = membershipApprovedTemplate(
      firstName,
      membershipNumber,
      membershipType,
      feeAmount,
      paymentMethod,
    );
    await this.sendEmail(email, subject, html);
  }

  async sendMembershipRejected(
    email: string,
    firstName: string,
    reason?: string,
  ): Promise<void> {
    const { subject, html } = membershipRejectedTemplate(firstName, reason);
    await this.sendEmail(email, subject, html);
  }

  async sendLoanApproved(
    email: string,
    firstName: string,
    principalAmount: number,
    monthlyInstalment: number,
    termMonths: number,
    maturityDate: Date,
  ): Promise<void> {
    const { subject, html } = loanApprovedTemplate(
      firstName,
      principalAmount,
      monthlyInstalment,
      termMonths,
      maturityDate,
    );
    await this.sendEmail(email, subject, html);
  }

  async sendLoanRejected(
    email: string,
    firstName: string,
    reason?: string,
  ): Promise<void> {
    const { subject, html } = loanRejectedTemplate(firstName, reason);
    await this.sendEmail(email, subject, html);
  }

  async sendRepaymentReminder(
    email: string,
    firstName: string,
    amountDue: number,
    dueDate: Date,
  ): Promise<void> {
    const { subject, html } = repaymentReminderTemplate(
      firstName,
      amountDue,
      dueDate,
    );
    await this.sendEmail(email, subject, html);
  }
}
