import databaseModule from '../../dist/core/database/prisma.service.js';
import jobsModule from '../../dist/core/jobs/jobs.service.js';
import deliveryModule from '../../dist/modules/reminders/reminder-delivery.service.js';
const logger = { info() {}, warn() {}, error() {} };
const db = new databaseModule.PrismaService();
await db.onModuleInit();
const jobs = new jobsModule.JobsService(db, logger);
await jobs.start();
const delivery = new deliveryModule.ReminderDeliveryService(db, jobs, {
  async send() { process.send({ state: 'attempt-started' }); await new Promise(() => {}); },
}, logger);
await jobs.boss.work(jobsModule.QUEUES.email, { includeMetadata: true, pollingIntervalSeconds: 0.5 }, async ([job]) => {
  await delivery.deliver(job);
});
