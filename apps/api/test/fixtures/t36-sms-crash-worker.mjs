import databaseModule from '../../dist/core/database/prisma.service.js';
import jobsModule from '../../dist/core/jobs/jobs.service.js';
import expiryModule from '../../dist/modules/reminders/membership-expiry.service.js';
import smsModule from '../../dist/modules/reminders/reminder-sms-delivery.service.js';
const db = new databaseModule.PrismaService(); await db.onModuleInit();
const jobs = new jobsModule.JobsService(db, { info() {}, warn() {}, error() {} }); await jobs.start();
const provider = { async send() { process.send({ event: process.env.T36_CRASH_POINT }); await new Promise(() => {}); } };
const service = new smsModule.ReminderSmsDeliveryService(db, new expiryModule.MembershipExpiryService(db), provider);
await jobs.boss.work(jobsModule.QUEUES.sms, { includeMetadata: true, pollingIntervalSeconds: 0.5 }, async ([job]) => {
  if (job.id !== process.env.T36_JOB_ID) return;
  await service.deliver(job); process.send({ event: 'done' });
});
