import registrationBody from '../../dist/modules/membership/registration/registration-body.js';
// Local browser-test harness only; never imported by the application.
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import database from '../../dist/core/database/prisma.service.js';
import databaseModule from '../../dist/core/database/database.module.js';
import redisModule from '../../dist/core/redis/redis.module.js';
import redisService from '../../dist/core/redis/redis.service.js';
import loggerModule from '../../dist/core/logger/logger.module.js';
import authModule from '../../dist/modules/auth/auth.module.js';
import membershipModule from '../../dist/modules/membership/membership.module.js';
import notificationsModule from '../../dist/modules/notifications/notifications.module.js';
import notificationsService from '../../dist/modules/notifications/notifications.service.js';
import exceptionModule from '../../dist/core/filters/global-exception.filter.js';
const dbUrl = process.env.T40_TEST_DATABASE_URL,
  redisUrl = process.env.AUTH_TEST_REDIS_URL;
if (!dbUrl || !redisUrl)
  throw new Error('Explicit local test services required');
const parsed = new URL(dbUrl),
  parsedRedis = new URL(redisUrl);
if (
  process.env.NODE_ENV !== 'test' ||
  !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
  !/^\/safethrift_[a-z0-9_]*test$/.test(parsed.pathname) ||
  !['localhost', '127.0.0.1'].includes(parsedRedis.hostname)
)
  throw new Error('Refusing unsafe fixture services');
Object.assign(process.env, {
  DATABASE_URL: dbUrl,
  T40_FIXTURE_MODE: 'true',
  T40_APPLICATIONS_ENABLED: 'false',
  JWT_SECRET: 't40-browser-test-secret-at-least-32-characters',
  REDIS_HOST: parsedRedis.hostname,
  REDIS_PORT: parsedRedis.port || '6379',
  REDIS_PASSWORD: '',
  T36_JOBS_ENABLED: 'false',
  T38_WEBHOOKS_ENABLED: 'false',
});
axios.get = async () => ({ data: 'NO_MATCH:0\n' });
const mailbox = new Map();
const db = new database.PrismaService();
await db.onModuleInit();
const fixture = await Test.createTestingModule({
  imports: [
    databaseModule.DatabaseModule,
    loggerModule.LoggerModule,
    redisModule.RedisModule,
    notificationsModule.NotificationsModule,
    ThrottlerModule.forRoot([{ name: 'short', ttl: 60000, limit: 100 }]),
    authModule.AuthModule,
    membershipModule.MembershipModule,
  ],
})
  .overrideProvider(database.PrismaService)
  .useValue(db)
  .overrideProvider(notificationsService.NotificationsService)
  .useValue({
    sendVerificationEmail: (email, _name, token) => {
      mailbox.set(email, token);
    },
  })
  .overrideGuard(ThrottlerGuard)
  .useValue({ canActivate: () => true })
  .compile();
const redis = fixture.get(redisService.RedisService);
const app = fixture.createNestApplication({ logger: false });
registrationBody.configureRegistrationBody(app);
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
app.enableCors({ origin: 'http://localhost:2040', credentials: true });
await app.listen(3040, '127.0.0.1');
process.send?.({ type: 'ready' });
process.on('message', (message) => {
  if (message.type === 'code')
    process.send?.({
      type: 'code',
      id: message.id,
      code: mailbox.get(message.email),
    });
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    const ids = await db.$transaction(async (tx) => {
      const members = await tx.member.findMany({
        where: { email: { in: [...mailbox.keys()] } },
        select: { id: true },
      });
      const ids = members.map((member) => member.id);
      const rows = await tx.membershipApplicationSubmission.findMany({
        where: { memberId: { in: ids } },
      });
      await tx.auditLog.deleteMany({
        where: { recordId: { in: rows.map((row) => row.id) } },
      });
      await tx.membershipApplicationSubmission.deleteMany({
        where: { memberId: { in: ids } },
      });
      await tx.memberRegistration.deleteMany({
        where: { memberId: { in: ids } },
      });
      await tx.member.deleteMany({ where: { id: { in: ids } } });
      return ids;
    });
    for (const id of ids) await redis.del('refresh:' + id);
    for (const token of mailbox.values())
      await redis.del('email_verify:' + token);
    await app.close();
    await db.onModuleDestroy();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
process.on('SIGTERM', () => void close());
process.on('disconnect', () => void close());
