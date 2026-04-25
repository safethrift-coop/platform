import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: any;

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env['DATABASE_URL'] ?? '',
    });
    this.client = new PrismaClient({ adapter });
  }

  get member() {
    return this.client.member;
  }
  get memberRegistration() {
    return this.client.memberRegistration;
  }
  get kycVerification() {
    return this.client.kycVerification;
  }
  get nextOfKin() {
    return this.client.nextOfKin;
  }
  get memberAccount() {
    return this.client.memberAccount;
  }
  get savingsTransaction() {
    return this.client.savingsTransaction;
  }
  get withdrawalTransaction() {
    return this.client.withdrawalTransaction;
  }
  get incomeRecord() {
    return this.client.incomeRecord;
  }
  get reminderLog() {
    return this.client.reminderLog;
  }
  get reminderResponse() {
    return this.client.reminderResponse;
  }
  get loanApplication() {
    return this.client.loanApplication;
  }
  get loan() {
    return this.client.loan;
  }
  get repaymentSchedule() {
    return this.client.repaymentSchedule;
  }
  get repaymentTransaction() {
    return this.client.repaymentTransaction;
  }
  get behaviouralFeatureSnapshot() {
    return this.client.behaviouralFeatureSnapshot;
  }
  get riskScore() {
    return this.client.riskScore;
  }
  get repaymentOutcome() {
    return this.client.repaymentOutcome;
  }
  get memberShare() {
    return this.client.memberShare;
  }
  get groupMembership() {
    return this.client.groupMembership;
  }
  get group() {
    return this.client.group;
  }
  get auditLog() {
    return this.client.auditLog;
  }

  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.client.$transaction(fn);
  }

  $executeRawUnsafe(query: string): Promise<unknown> {
    return this.client.$executeRawUnsafe(query);
  }

  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T> {
    return this.client.$queryRaw(query, ...values);
  }

  get member_count() {
    return this.client.member.count();
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
    this.logger.log('Database disconnected');
  }
}
