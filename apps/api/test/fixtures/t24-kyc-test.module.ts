import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  DynamicModule,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  Module,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../src/core/guards/jwt-auth.guard';
import { JwtStrategy } from '../../src/core/strategies/jwt.strategy';
import { PrismaService } from '../../src/core/database/prisma.service';
import { CurrentMember } from '../../src/core/decorators/current-member.decorator';
import type { JwtPayload } from '../../src/core/decorators/current-member.decorator';
import { SyntheticKycProvider } from './t24-synthetic-provider';
import {
  SyntheticWebhookVerifier,
  type SyntheticWebhookEvent,
} from './t24-synthetic-webhook';

export interface SyntheticAttemptRow {
  id: string;
  verification_id: string;
  member_id: string;
  idempotency_key: string;
  request_hash: string;
  correlation_id: string;
  sequence: number;
  is_current: boolean;
  initiation_state: 'pending' | 'started' | 'permanent_failure';
  created_at: Date;
  verification_status: 'pending' | SyntheticWebhookEvent['transition'];
}

type AttemptState = Pick<
  SyntheticAttemptRow,
  | 'id'
  | 'verification_id'
  | 'member_id'
  | 'correlation_id'
  | 'initiation_state'
  | 'verification_status'
>;

interface SyntheticEventRow {
  id: string;
  attempt_id: string;
  event_id: string;
  event_hash: string;
  sequence: number;
  transition: SyntheticWebhookEvent['transition'];
  outcome: 'pending' | 'applied' | 'rejected';
  created_at: Date;
}

const CONFIG = Symbol('synthetic test configuration');
export interface SyntheticTestConfig {
  pool: Pool;
  fixtureIds: ReadonlySet<string>;
  provider: SyntheticKycProvider;
  verifier: SyntheticWebhookVerifier;
}

@Injectable()
export class SyntheticKycService {
  constructor(@Inject(CONFIG) protected readonly config: SyntheticTestConfig) {}

  protected async transaction<T>(
    fn: (db: PoolClient) => Promise<T>,
  ): Promise<T> {
    const db = await this.config.pool.connect();
    try {
      await db.query('BEGIN');
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Synthetic processing unavailable');
    } finally {
      db.release();
    }
  }

  protected async audit(
    db: PoolClient,
    verificationId: string,
    action: 'insert' | 'update',
    memberId: string,
    status: string,
  ): Promise<void> {
    await db.query(
      'INSERT INTO audit_logs (audit_id, table_name, record_id, action_type, changed_by, new_value) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        randomUUID(),
        'kyc_verification',
        verificationId,
        action,
        memberId,
        JSON.stringify({ mode: 'synthetic', status }),
      ],
    );
  }

  async submit(memberId: string, key: string): Promise<unknown> {
    const requestHash = createHash('sha256').update('{}').digest('hex');
    const attempt = await this.transaction<AttemptState>(async (db) => {
      const member = await db.query<{ email: string }>(
        "SELECT email FROM members WHERE member_id=$1 AND membership_status='active' FOR UPDATE",
        [memberId],
      );
      if (
        !this.config.fixtureIds.has(memberId) ||
        member.rowCount !== 1 ||
        !String(member.rows[0].email).toLowerCase().endsWith('.invalid')
      )
        throw new UnauthorizedException();
      const existing = await db.query<SyntheticAttemptRow>(
        'SELECT a.*, k.verification_status FROM kyc_synthetic_attempts a JOIN kyc_verification k ON k.kyc_id=a.verification_id AND k.member_id=a.member_id WHERE a.member_id=$1 AND a.idempotency_key=$2',
        [memberId, key],
      );
      if (existing.rowCount) {
        if (existing.rows[0].request_hash !== requestHash)
          throw new ConflictException();
        return existing.rows[0];
      }
      const current = await db.query<SyntheticAttemptRow>(
        'SELECT a.*, k.verification_status FROM kyc_synthetic_attempts a JOIN kyc_verification k ON k.kyc_id=a.verification_id AND k.member_id=a.member_id WHERE a.member_id=$1 AND a.is_current',
        [memberId],
      );
      if (current.rows.length > 1) throw new ConflictException();
      if (
        current.rows.length &&
        ['pending', 'in_progress'].includes(current.rows[0].verification_status)
      )
        throw new ConflictException();
      if (current.rows.length)
        await db.query(
          'UPDATE kyc_synthetic_attempts SET is_current=false WHERE id=$1',
          [current.rows[0].id],
        );
      const sequence = await db.query<{ next: number }>(
        'SELECT COALESCE(MAX(sequence),0)+1 AS next FROM kyc_synthetic_attempts WHERE member_id=$1',
        [memberId],
      );
      const verificationId = randomUUID(),
        id = randomUUID(),
        correlationId = randomUUID();
      await db.query(
        "INSERT INTO kyc_verification (kyc_id, member_id, document_type, updated_at) VALUES ($1,$2,'passport',CURRENT_TIMESTAMP)",
        [verificationId, memberId],
      );
      await db.query(
        'INSERT INTO kyc_synthetic_attempts (id, verification_id, member_id, idempotency_key, request_hash, correlation_id, sequence) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          id,
          verificationId,
          memberId,
          key,
          requestHash,
          correlationId,
          sequence.rows[0].next,
        ],
      );
      await this.audit(db, verificationId, 'insert', memberId, 'pending');
      return {
        id,
        verification_id: verificationId,
        member_id: memberId,
        correlation_id: correlationId,
        initiation_state: 'pending',
        verification_status: 'pending',
      };
    });
    if (attempt.initiation_state === 'pending') {
      const outcome = await this.config.provider.initiate(
        attempt.correlation_id,
      );
      if (outcome === 'retryable_failure')
        throw new ServiceUnavailableException();
      await this.transaction(async (db) => {
        const locked = await db.query<SyntheticAttemptRow>(
          'SELECT a.*, k.verification_status FROM kyc_synthetic_attempts a JOIN kyc_verification k ON k.kyc_id=a.verification_id WHERE a.id=$1 FOR UPDATE OF a, k',
          [attempt.id],
        );
        const row = locked.rows[0];
        if (row.initiation_state !== 'pending') return;
        await db.query(
          'UPDATE kyc_synthetic_attempts SET initiation_state=$2 WHERE id=$1',
          [attempt.id, outcome],
        );
        if (outcome === 'started' && row.verification_status === 'pending') {
          await db.query(
            "UPDATE kyc_verification SET verification_status='in_progress',updated_at=CURRENT_TIMESTAMP WHERE kyc_id=$1",
            [row.verification_id],
          );
          await this.audit(
            db,
            row.verification_id,
            'update',
            row.member_id,
            'in_progress',
          );
        }
      });
      if (outcome === 'permanent_failure')
        throw new ServiceUnavailableException();
    } else if (attempt.initiation_state === 'permanent_failure')
      throw new ServiceUnavailableException();
    const result = await this.config.pool.query<
      Pick<SyntheticAttemptRow, 'verification_status'>
    >(
      'SELECT k.verification_status FROM kyc_synthetic_attempts a JOIN kyc_verification k ON k.kyc_id=a.verification_id WHERE a.id=$1',
      [attempt.id],
    );
    return {
      mode: 'synthetic',
      attemptId: attempt.id,
      status: result.rows[0].verification_status,
    };
  }

  async status(memberId: string): Promise<unknown> {
    if (!this.config.fixtureIds.has(memberId))
      throw new UnauthorizedException();
    const fixture = await this.config.pool.query(
      "SELECT 1 FROM members WHERE member_id=$1 AND membership_status='active' AND lower(email) LIKE '%.invalid'",
      [memberId],
    );
    if (fixture.rowCount !== 1) throw new UnauthorizedException();
    const rows = await this.config.pool.query<
      Pick<SyntheticAttemptRow, 'id' | 'verification_status'>
    >(
      "SELECT a.id,k.verification_status FROM kyc_synthetic_attempts a JOIN kyc_verification k ON k.kyc_id=a.verification_id AND k.member_id=a.member_id JOIN members m ON m.member_id=a.member_id WHERE a.member_id=$1 AND a.is_current AND m.membership_status='active' AND lower(m.email) LIKE '%.invalid'",
      [memberId],
    );
    return rows.rows.length === 1
      ? {
          mode: 'synthetic',
          attemptId: rows.rows[0].id,
          status: rows.rows[0].verification_status,
        }
      : { mode: 'synthetic', status: 'not_available' };
  }
}

@Injectable()
export class SyntheticWebhookService extends SyntheticKycService {
  async webhook(
    raw: Buffer,
    signature: string | undefined,
    contentType: string | undefined,
  ): Promise<void> {
    let verified: ReturnType<SyntheticWebhookVerifier['verify']>;
    try {
      verified = this.config.verifier.verify(raw, signature, contentType);
    } catch {
      throw new BadRequestException('Invalid synthetic webhook');
    }
    const { event, hash } = verified;
    await this.transaction(async (db) => {
      const found = await db.query<SyntheticAttemptRow>(
        "SELECT a.*, k.verification_status FROM kyc_synthetic_attempts a JOIN kyc_verification k ON k.kyc_id=a.verification_id AND k.member_id=a.member_id JOIN members m ON m.member_id=a.member_id WHERE a.correlation_id=$1 AND lower(m.email) LIKE '%.invalid' FOR UPDATE OF a, k",
        [event.correlationId],
      );
      if (
        found.rowCount !== 1 ||
        !this.config.fixtureIds.has(found.rows[0].member_id)
      )
        throw new BadRequestException('Unknown synthetic attempt');
      const attempt = found.rows[0];
      const duplicate = await db.query<SyntheticEventRow>(
        'SELECT * FROM kyc_synthetic_events WHERE event_id=$1',
        [event.eventId],
      );
      if (
        duplicate.rowCount &&
        (duplicate.rows[0].event_hash !== hash ||
          duplicate.rows[0].attempt_id !== attempt.id)
      )
        throw new ConflictException();
      if (!duplicate.rowCount) {
        const occupied = await db.query(
          'SELECT id FROM kyc_synthetic_events WHERE attempt_id=$1 AND sequence=$2',
          [attempt.id, event.sequence],
        );
        if (occupied.rowCount) throw new ConflictException();
        await db.query(
          "INSERT INTO kyc_synthetic_events (id,attempt_id,event_id,event_hash,sequence,transition,outcome) VALUES ($1,$2,$3,$4,$5,$6,'pending')",
          [
            randomUUID(),
            attempt.id,
            event.eventId,
            hash,
            event.sequence,
            event.transition,
          ],
        );
      }
      const events = await db.query<SyntheticEventRow>(
        'SELECT * FROM kyc_synthetic_events WHERE attempt_id=$1 ORDER BY sequence',
        [attempt.id],
      );
      let next = 1,
        state: SyntheticAttemptRow['verification_status'] =
          attempt.verification_status;
      for (const item of events.rows) {
        if (item.sequence !== next) break;
        next++;
        if (item.outcome !== 'pending') continue;
        const allowed =
          (state === 'pending' && item.transition === 'in_progress') ||
          (state === 'in_progress' &&
            ['verified', 'rejected'].includes(item.transition)) ||
          (state === 'verified' && item.transition === 'expired');
        await db.query(
          'UPDATE kyc_synthetic_events SET outcome=$2 WHERE id=$1',
          [item.id, allowed ? 'applied' : 'rejected'],
        );
        if (allowed) {
          state = item.transition;
          await db.query(
            'UPDATE kyc_verification SET verification_status=$2, updated_at=CURRENT_TIMESTAMP WHERE kyc_id=$1',
            [attempt.verification_id, state],
          );
          await this.audit(
            db,
            attempt.verification_id,
            'update',
            attempt.member_id,
            state,
          );
        }
      }
    });
  }
}

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class SyntheticKycController {
  constructor(private readonly service: SyntheticKycService) {}
  @Post('submit')
  @HttpCode(202)
  submit(
    @CurrentMember() user: JwtPayload,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    response.setHeader('Cache-Control', 'private, no-store');
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length ||
      typeof key !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(key)
    )
      throw new BadRequestException();
    return this.service.submit(user.sub, key);
  }
  @Get('status')
  status(
    @CurrentMember() user: JwtPayload,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    response.setHeader('Cache-Control', 'private, no-store');
    if (Object.keys(query).length) throw new BadRequestException();
    return this.service.status(user.sub);
  }
}

@Controller('webhooks')
export class SyntheticWebhookController {
  constructor(private readonly service: SyntheticWebhookService) {}
  @Post('onfido')
  @HttpCode(200)
  async webhook(
    @Req() request: Request,
    @Headers('x-synthetic-signature') signature: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ received: true }> {
    response.setHeader('Cache-Control', 'private, no-store');
    await this.service.webhook(request.body as Buffer, signature, contentType);
    return { received: true };
  }
}

@Module({})
export class SyntheticKycTestModule {
  static register(config: SyntheticTestConfig): DynamicModule {
    if (process.env.NODE_ENV !== 'test')
      throw new Error('Synthetic KYC is test-only');
    const connectionString = config.pool.options.connectionString;
    if (!connectionString || connectionString !== process.env.DATABASE_URL)
      throw new Error(
        'Synthetic KYC requires its explicitly selected database',
      );
    const database = new URL(connectionString);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
      !/^\/safethrift_[a-z0-9_]*test$/.test(database.pathname)
    )
      throw new Error('Synthetic KYC requires a local test database');
    return {
      module: SyntheticKycTestModule,
      controllers: [SyntheticKycController, SyntheticWebhookController],
      providers: [
        SyntheticKycService,
        SyntheticWebhookService,
        JwtAuthGuard,
        JwtStrategy,
        PrismaService,
        { provide: CONFIG, useValue: config },
      ],
    };
  }
}
