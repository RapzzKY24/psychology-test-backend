import { Inject, Injectable } from '@nestjs/common';
import type {
  CertificateStatus,
  CertificateVerdict,
} from '../../../generated/prisma/client';
import { createRateLimiter } from '../../../common/utils/in-memory-rate-limiter';
import { maskParticipantName } from '../../reviews/utils/mask-participant-name';
import { CERTIFICATES_REPOSITORY } from '../repository/certificates.repository';
import type { CertificatesRepository } from '../repository/certificates.repository';
import type { CertificateSnapshot } from '../utils/certificate-snapshot';

/** Same ceiling as the report and test-result verification endpoints (30/min/IP). */
const VERIFY_RATE_LIMIT = 30;

export interface PublicCertificateVerification {
  valid: boolean;
  number?: string;
  revision?: number;
  status?: CertificateStatus;
  /** Masked: a stranger scanning the QR does not need the full identity. */
  holderName?: string;
  testName?: string;
  verdict?: CertificateVerdict;
  /** ISO date (YYYY-MM-DD). */
  validUntil?: string;
  issuedAt?: Date | null;
  issuerName?: string;
  issuerSipp?: string | null;
  revokedAt?: Date | null;
  revokeReason?: string | null;
}

/**
 * Anonymous QR verification for certificates.
 *
 * Deliberately narrower than the PDF: number, masked name, test, verdict,
 * validity and the issuer. The identity block and the photo stay out — the
 * person holding the paper already has them, a scanner does not.
 */
@Injectable()
export class PublicCertificatesService {
  private readonly verifyLimiter = createRateLimiter(VERIFY_RATE_LIMIT, 60_000);

  constructor(
    @Inject(CERTIFICATES_REPOSITORY)
    private readonly repo: CertificatesRepository,
  ) {}

  async verify(
    code: string,
    ip: string,
  ): Promise<PublicCertificateVerification> {
    this.verifyLimiter.check(`certificate-verify:${ip}`);

    const normalized = code.trim().toUpperCase();
    if (!normalized) return { valid: false };

    const row = await this.repo.findByVerifyCode(normalized);
    if (!row) return { valid: false };

    // A superseded revision has its code cleared, so only these two arrive.
    // Anything else is a code that should not resolve at all.
    if (row.status !== 'ACTIVE' && row.status !== 'REVOKED') {
      return { valid: false };
    }

    const snapshot = row.snapshot as CertificateSnapshot;
    const base = {
      valid: true,
      number: row.number,
      revision: row.revision,
      status: row.status,
      holderName: maskParticipantName(snapshot.holder.fullName),
      testName: snapshot.test.name,
      issuedAt: row.issuedAt,
      issuerName: snapshot.issuer.fullName,
      issuerSipp: snapshot.issuer.sippNumber,
    };

    // A cancelled certificate still answers, so the holder learns why it no
    // longer holds — but it stops asserting a verdict it no longer stands by.
    if (row.status === 'REVOKED') {
      return {
        ...base,
        revokedAt: row.revokedAt,
        revokeReason: row.revokeReason,
      };
    }

    return {
      ...base,
      verdict: snapshot.verdict,
      validUntil: snapshot.validUntil,
    };
  }
}
