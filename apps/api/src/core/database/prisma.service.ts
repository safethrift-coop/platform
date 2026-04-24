import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';

const { PrismaClient } = require('@prisma/client') as {
  PrismaClient: new () => PrismaClientInstance;
};

type PrismaClientInstance = Record<string, any> & {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
  $transaction: <T>(fn: (tx: PrismaClientInstance) => Promise<T>) => Promise<T>;
  $executeRawUnsafe: (query: string) => Promise<unknown>;
  $queryRaw: <T>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
  member: PrismaClientInstance[string];
  memberRegistration: PrismaClientInstance[string];
  kycVerification: PrismaClientInstance[string];
  nextOfKin: PrismaClientInstance[string];
  memberAccount: PrismaClientInstance[string];
  savingsTransaction: PrismaClientInstance[string];
  withdrawalTransaction: PrismaClientInstance[string];
  incomeRecord: PrismaClientInstance[string];
  reminderLog: PrismaClientInstance[string];
  reminderResponse: PrismaClientInstance[string];
  loanApplication: PrismaClientInstance[string];
  loan: PrismaClientInstance[string];
  repaymentSchedule: PrismaClientInstance[string];
  repaymentTransaction: PrismaClientInstance[string];
  behaviouralFeatureSnapshot: PrismaClientInstance[string];
  riskScore: PrismaClientInstance[string];
  repaymentOutcome: PrismaClientInstance[string];
  memberShare: PrismaClientInstance[string];
  groupMembership: PrismaClientInstance[string];
  group: PrismaClientInstance[string];
  auditLog: PrismaClientInstance[string];
};

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClientInstance;

  constructor() {
    this.client = new PrismaClient();
  }

  get member() {
    return this.client['member'];
  }
  get memberRegistration() {
    return this.client['memberRegistration'];
  }
  get kycVerification() {
    return this.client['kycVerification'];
  }
  get nextOfKin() {
    return this.client['nextOfKin'];
  }
  get memberAccount() {
    return this.client['memberAccount'];
  }
  get savingsTransaction() {
    return this.client['savingsTransaction'];
  }
  get withdrawalTransaction() {
    return this.client['withdrawalTransaction'];
  }
  get incomeRecord() {
    return this.client['incomeRecord'];
  }
  get reminderLog() {
    return this.client['reminderLog'];
  }
  get reminderResponse() {
    return this.client['reminderResponse'];
  }
  get loanApplication() {
    return this.client['loanApplication'];
  }
  get loan() {
    return this.client['loan'];
  }
  get repaymentSchedule() {
    return this.client['repaymentSchedule'];
  }
  get repaymentTransaction() {
    return this.client['repaymentTransaction'];
  }
  get behaviouralFeatureSnapshot() {
    return this.client['behaviouralFeatureSnapshot'];
  }
  get riskScore() {
    return this.client['riskScore'];
  }
  get repaymentOutcome() {
    return this.client['repaymentOutcome'];
  }
  get memberShare() {
    return this.client['memberShare'];
  }
  get groupMembership() {
    return this.client['groupMembership'];
  }
  get group() {
    return this.client['group'];
  }
  get auditLog() {
    return this.client['auditLog'];
  }

  async $transaction<T>(
    fn: (tx: PrismaClientInstance) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(fn);
  }

  async $executeRawUnsafe(query: string): Promise<unknown> {
    return this.client.$executeRawUnsafe(query);
  }

  async $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T> {
    return this.client.$queryRaw<T>(query, ...values);
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
