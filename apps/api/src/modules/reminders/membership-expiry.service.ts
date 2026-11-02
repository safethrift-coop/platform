import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

type Store = PrismaService | Pick<Prisma.TransactionClient, '$queryRaw'>;

export interface CurrentExpiry {
  id: string;
  memberId: string;
  expiresOn: Date | null;
  sourceReference: string;
  authorityReference: string;
  recordedAt: Date;
}

interface ChainRow {
  id: string | null;
  memberId: string | null;
  expiresOn: Date | null;
  sourceReference: string | null;
  authorityReference: string | null;
  recordedAt: Date | null;
  valid: boolean;
  total: bigint;
}

export interface RecordExpiryInput {
  memberId: string;
  expiresOn: Date | null;
  sourceReference: string;
  authorityReference: string;
  recordedBy?: string;
  expectedPredecessorId: string | null;
}

@Injectable()
export class MembershipExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  async current(memberId: string, store: Store = this.prisma) {
    const rows = await store.$queryRaw<ChainRow[]>`
      WITH RECURSIVE chain AS (
        SELECT r.id, r.member_id, r.expires_on, r.source_reference,
               r.authority_reference, r.recorded_at, ARRAY[r.id] AS path,
               false AS cycle
          FROM membership_expiry_records r
         WHERE r.member_id = ${memberId} AND r.replaces_record_id IS NULL
        UNION ALL
        SELECT r.id, r.member_id, r.expires_on, r.source_reference,
               r.authority_reference, r.recorded_at, c.path || r.id,
               r.id = ANY(c.path)
          FROM membership_expiry_records r
          JOIN chain c ON r.replaces_record_id = c.id
         WHERE NOT c.cycle AND r.member_id = ${memberId}
      ), stats AS (
        SELECT
          (SELECT count(*) FROM membership_expiry_records WHERE member_id = ${memberId}) AS total,
          (SELECT count(*) FROM chain WHERE NOT cycle) AS reachable,
          (SELECT count(*) FROM membership_expiry_records WHERE member_id = ${memberId} AND replaces_record_id IS NULL) AS roots,
          (SELECT count(*) FROM membership_expiry_records r WHERE r.member_id = ${memberId}
             AND NOT EXISTS (SELECT 1 FROM membership_expiry_records n WHERE n.replaces_record_id = r.id)) AS tips,
          (SELECT count(*) FROM chain WHERE cycle) AS cycles
      )
      SELECT c.id, c.member_id AS "memberId", c.expires_on AS "expiresOn",
             c.source_reference AS "sourceReference",
             c.authority_reference AS "authorityReference",
             c.recorded_at AS "recordedAt",
             (s.total = s.reachable AND s.roots = 1 AND s.tips = 1 AND s.cycles = 0) AS valid,
             s.total
        FROM stats s LEFT JOIN chain c ON NOT c.cycle
         AND NOT EXISTS (SELECT 1 FROM membership_expiry_records n WHERE n.replaces_record_id = c.id)
    `;
    if (rows.length === 1 && rows[0].total === 0n) return null;
    const row = rows[0];
    if (
      rows.length !== 1 ||
      !row.valid ||
      row.id === null ||
      row.memberId === null ||
      row.sourceReference === null ||
      row.authorityReference === null ||
      row.recordedAt === null
    )
      throw new Error('Invalid membership expiry chain');
    return {
      id: row.id,
      memberId: row.memberId,
      expiresOn: row.expiresOn,
      sourceReference: row.sourceReference,
      authorityReference: row.authorityReference,
      recordedAt: row.recordedAt,
    };
  }

  // Internal transaction contract only. T36 exposes no HTTP write endpoint.
  async record(input: RecordExpiryInput): Promise<CurrentExpiry> {
    if (!input.sourceReference.trim() || !input.authorityReference.trim())
      throw new ConflictException('Expiry provenance is required');
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT member_id AS id FROM members
           WHERE member_id = ${input.memberId} FOR UPDATE
        `;
        if (!locked.length) throw new NotFoundException('Member not found');
        const current = await this.current(input.memberId, tx);
        if ((current?.id ?? null) !== input.expectedPredecessorId)
          throw new ConflictException('Membership expiry predecessor changed');
        const id = randomUUID();
        const created = await tx.membershipExpiryRecord.create({
          data: {
            id,
            memberId: input.memberId,
            expiresOn: input.expiresOn,
            sourceReference: input.sourceReference.trim(),
            authorityReference: input.authorityReference.trim(),
            recordedBy: input.recordedBy,
            replacesRecordId: current?.id,
          },
        });
        await tx.auditLog.create({
          data: {
            tableName: 'membership_expiry_records',
            recordId: id,
            actionType: 'insert',
            changedBy: input.recordedBy,
            newValue: JSON.stringify({
              memberId: input.memberId,
              expiresOn: input.expiresOn?.toISOString().slice(0, 10) ?? null,
              sourceReference: input.sourceReference.trim(),
              authorityReference: input.authorityReference.trim(),
              replacesRecordId: current?.id ?? null,
            }),
          },
        });
        return created;
      },
      { isolationLevel: 'Serializable', timeout: 10000 },
    );
  }
}
