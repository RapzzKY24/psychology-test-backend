import { Inject, Injectable } from '@nestjs/common';
import type {
  Recommendation,
  ReportStatus,
} from '../../../generated/prisma/client';
import { createRateLimiter } from '../../../common/utils/in-memory-rate-limiter';
import { maskParticipantName } from '../../reviews/utils/mask-participant-name';
import { REPORTS_REPOSITORY } from '../repository/reports.repository';
import type { ReportsRepository } from '../repository/reports.repository';

/** Same ceiling as the test-result verification endpoint (30/min/IP). */
const VERIFY_RATE_LIMIT = 30;

export interface PublicReportVerification {
  valid: boolean;
  number?: string;
  revision?: number;
  status?: ReportStatus;
  holderName?: string;
  sessionTitle?: string;
  issuedAt?: Date | null;
  recommendation?: Recommendation;
  revokedAt?: Date | null;
  revokeReason?: string | null;
}

/**
 * Anonymous QR verification. The holder's name is masked and a revoked report
 * stops exposing its recommendation — whoever scans a cancelled document gets
 * the cancellation, not the conclusion.
 */
@Injectable()
export class PublicReportsService {
  private readonly verifyLimiter = createRateLimiter(VERIFY_RATE_LIMIT, 60_000);

  constructor(
    @Inject(REPORTS_REPOSITORY)
    private readonly repo: ReportsRepository,
  ) {}

  async verify(code: string, ip: string): Promise<PublicReportVerification> {
    this.verifyLimiter.check(`report-verify:${ip}`);

    const normalized = code.trim().toUpperCase();
    if (!normalized) return { valid: false };

    const row = await this.repo.findByVerifyCode(normalized);
    if (!row) return { valid: false };

    // Drafts never carry a code and a superseded revision loses its own, so
    // only ACTIVE/REVOKED should arrive here. Anything else stays unknown.
    if (row.status !== 'ACTIVE' && row.status !== 'REVOKED') {
      return { valid: false };
    }

    const base = {
      valid: true,
      number: row.number,
      revision: row.revision,
      status: row.status,
      holderName: maskParticipantName(row.snapshot.holder.name),
      sessionTitle: row.snapshot.session.title,
      issuedAt: row.issuedAt,
    };

    if (row.status === 'REVOKED') {
      return {
        ...base,
        revokedAt: row.revokedAt,
        revokeReason: row.revokeReason,
      };
    }

    return { ...base, recommendation: row.snapshot.recommendation };
  }
}
