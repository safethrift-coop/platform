// Synthetic local browser fixture. Not imported by application code.
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import database from '../../dist/core/database/prisma.service.js';
import databaseModule from '../../dist/core/database/database.module.js';
import redisModule from '../../dist/core/redis/redis.module.js';
import redisService from '../../dist/core/redis/redis.service.js';
import loggerModule from '../../dist/core/logger/logger.module.js';
import authModule from '../../dist/modules/auth/auth.module.js';
import membersModule from '../../dist/modules/members/members.module.js';
import loansModule from '../../dist/modules/loans/loans.module.js';
import savingsModule from '../../dist/modules/savings/savings.module.js';
import pointsModule from '../../dist/modules/points/points.module.js';
import notificationsModule from '../../dist/modules/notifications/notifications.module.js';
import exceptionModule from '../../dist/core/filters/global-exception.filter.js';
const dbUrl = process.env.T42_TEST_DATABASE_URL,
  redisUrl = process.env.AUTH_TEST_REDIS_URL;
if (!dbUrl || !redisUrl)
  throw new Error('Explicit local test services required');
const parsed = new URL(dbUrl),
  parsedRedis = new URL(redisUrl);
if (
  process.env.NODE_ENV !== 'test' ||
  !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
  !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname) ||
  !['localhost', '127.0.0.1'].includes(parsedRedis.hostname) ||
  parsedRedis.protocol !== 'redis:'
)
  throw new Error('Refusing unsafe fixture services');
Object.assign(process.env, {
  DATABASE_URL: dbUrl,
  RESEND_API_KEY: 're_test_not_a_live_key',
  SAVINGS_SIMULATION_ENABLED: 'false',
  T40_FIXTURE_MODE: 'false',
  T40_APPLICATIONS_ENABLED: 'false',
  T38_WEBHOOKS_ENABLED: 'false',
  T36_JOBS_ENABLED: 'false',
  JWT_SECRET: 't41-browser-local-secret-at-least-32-characters',
  REDIS_HOST: parsedRedis.hostname,
  REDIS_PORT: parsedRedis.port || '6379',
  REDIS_PASSWORD: decodeURIComponent(parsedRedis.password),
});
const db = new database.PrismaService();
await db.onModuleInit();
const password = 'Fixture@1234',
  id = randomUUID(),
  pendingId = randomUUID();
const passwordHash = await bcrypt.hash(password, 12);
const ids = [id, pendingId];
for (const memberId of ids)
  await db.member.create({
    data: {
      id: memberId,
      membershipNumber: memberId,
      firstName: 'Synthetic',
      lastName: 'Dashboard',
      email: `${memberId}@example.invalid`,
      dateOfBirth: new Date('1990-01-01'),
      phoneNumber: 'test',
      addressLine1: 'Test',
      city: 'Test',
      postcode: 'TEST',
      passwordHash,
      emailVerified: true,
      membershipStatus: memberId === id ? 'active' : 'pending',
      savingsPointsTotal: 123,
      currentRiskBand: memberId === id ? 'low_risk' : 'unscored',
    },
  });
await db.member.update({ where: { id }, data: { isAdmin: true } });
const application = await db.loanApplication.create({ data: { memberId: id, requestedAmount: '100.00', requestedTermMonths: 3, loanPurpose: 'Synthetic loan browser fixture', behaviouralScoreAtApplication: '0', predictedRepaymentProbability: '0' } });
await db.loanApplication.create({ data: { memberId: pendingId, requestedAmount: '50.00', requestedTermMonths: 3, loanPurpose: 'Missing snapshot fixture' } });
const account = await db.memberAccount.create({ data: { memberId: id, accountNumber: randomUUID(), accountType: 'loan' } });
const loan = await db.loan.create({ data: { memberId: id, applicationId: application.id, loanAccountId: account.id, principalAmount: '100.00', termMonths: 3, installmentAmount: '33.33', loanStatus: 'active', maturityDate: new Date('2027-01-01') } });
for (let i=1; i<=3; i++) await db.repaymentSchedule.create({ data: { loanId: loan.id, installmentNumber: i, dueDate: new Date('2026-12-01'), principalDue: i===3 ? '33.34' : '33.33', totalDue: i===3 ? '33.34' : '33.33' } });
for (let i=0; i<25; i++) await db.repaymentTransaction.create({ data: { loanId: loan.id, memberId: id, amountPaid: '0.01', paymentChannel: 'legacy', paymentStatus: 'completed', paymentDate: new Date('2026-01-01') } });
const fixture = await Test.createTestingModule({
  imports: [
    databaseModule.DatabaseModule,
    loggerModule.LoggerModule,
    redisModule.RedisModule,
    notificationsModule.NotificationsModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }]),
    EventEmitterModule.forRoot(),
    authModule.AuthModule,
    membersModule.MembersModule,
    savingsModule.SavingsModule,
    loansModule.LoansModule,
    pointsModule.PointsModule,
  ],
})
  .overrideProvider(database.PrismaService)
  .useValue(db)
  .compile();
const redis = fixture.get(redisService.RedisService);
const app = fixture.createNestApplication({ logger: false });
app.setGlobalPrefix('api/v1');
app.use(cookieParser());
app.useGlobalFilters(new exceptionModule.GlobalExceptionFilter());
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
app.enableCors({ origin: 'http://localhost:2042', credentials: true });
await app.listen(3042, '127.0.0.1');
process.send?.({
  type: 'ready',
  email: `${id}@example.invalid`,
  pendingEmail: `${pendingId}@example.invalid`,
  password,
  loanId: loan.id,
  applicationId: application.id,
});
process.on('message', (message) => {
  if (message.type === 'gate') {
    process.env.SAVINGS_SIMULATION_ENABLED = message.enabled ? 'true' : 'false';
    process.send?.({ type: 'gate', id: message.id });
  }
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    if (await db.loanApplication.count({where:{memberId:{in:ids}}}) !== 2 || await db.repaymentTransaction.count({where:{memberId:{in:ids}}}) !== 25) throw new Error("Unexpected financial writes");
    await db.$transaction(async (tx) => {
      await tx.repaymentTransaction.deleteMany({where:{memberId:{in:ids}}});
      await tx.repaymentSchedule.deleteMany({where:{loanId:loan.id}});
      await tx.loan.deleteMany({where:{memberId:{in:ids}}});
      await tx.loanApplication.deleteMany({where:{memberId:{in:ids}}});
      await tx.savingsPointsReceipt.deleteMany({
        where: { transaction: { memberId: { in: ids } } },
      });
      await tx.savingsRequest.deleteMany({ where: { memberId: { in: ids } } });
      await tx.complianceFlag.deleteMany({ where: { memberId: { in: ids } } });
      await tx.auditLog.deleteMany({ where: { changedBy: { in: ids } } });
      await tx.savingsTransaction.deleteMany({
        where: { memberId: { in: ids } },
      });
      await tx.withdrawalTransaction.deleteMany({
        where: { memberId: { in: ids } },
      });
      await tx.memberAccount.deleteMany({ where: { memberId: { in: ids } } });
      await tx.member.deleteMany({ where: { id: { in: ids } } });
    });
    for (const memberId of ids) await redis.del('refresh:' + memberId);
    await app.close();
    await db.onModuleDestroy();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
process.on('SIGTERM', () => void close());
process.on('disconnect', () => void close());
