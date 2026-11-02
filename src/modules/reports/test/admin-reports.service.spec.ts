/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AdminReportsService } from '../service/admin-reports.service';
import type {
  ReportDocument,
  ReportsRepository,
} from '../repository/reports.repository';
import { NARRATIVE_KEYS, RATING_KEYS } from '../rubric';

function document(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    id: 'r1',
    participantId: 'p1',
    number: '050/PSIKOTES/YM/XI/2026',
    revision: 1,
    verifyCode: 'ABCD123456',
    status: 'ACTIVE',
    snapshot: {
      holder: {
        name: 'Budi',
        age: 27,
        education: 'SMA',
        destination: 'Taiwan',
      },
      session: { id: 's1', title: 'Psikotes' },
      tests: [{ name: 'DISC', patternCode: 'I' }],
      assessor: {
        fullName: 'Faradila',
        degree: 'M.Psi',
        licenseNumber: '25022211674',
        sippNumber: null,
        signaturePath: 'uploads/sig.png',
      },
      institution: 'YULIARPAN MEDIKA/ETP',
      ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, 'B'])),
      narratives: Object.fromEntries(NARRATIVE_KEYS.map((k) => [k, 'Baik.'])),
      recommendation: 'LAYAK',
      examDate: '2026-01-11',
      issuedAt: '2026-11-02T03:15:00.000Z',
    },
    ...overrides,
  };
}

describe('AdminReportsService', () => {
  let service: AdminReportsService;
  let repo: jest.Mocked<ReportsRepository>;

  beforeEach(() => {
    repo = {
      findParticipantContext: jest.fn(),
      findDraftByParticipant: jest.fn(),
      findActiveByParticipant: jest.fn(),
      createDraft: jest.fn(),
      updateDraft: jest.fn(),
      findPsychologist: jest.fn(),
      nextSeq: jest.fn(),
      nextRevision: jest.fn(),
      issueDraft: jest.fn(),
      findSettings: jest.fn(),
      listReports: jest.fn(),
      findForPdf: jest.fn(),
      listForInstitution: jest.fn(),
      findForPdfInInstitution: jest.fn(),
      supersede: jest.fn(),
      revoke: jest.fn(),
      findByVerifyCode: jest.fn(),
      findBackfillCandidates: jest.fn(),
    };
    service = new AdminReportsService(repo);
  });

  describe('revise', () => {
    it('rejects a reason shorter than 10 characters', async () => {
      await expect(
        service.revise('r1', 'admin', { reason: 'salah' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects an invalid rating', async () => {
      await expect(
        service.revise('r1', 'admin', {
          reason: 'salah input nilai',
          ratings: { 'intellectual.logic': 'X' },
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws 404 for an unknown report', async () => {
      repo.findForPdf.mockResolvedValue(null);
      await expect(
        service.revise('r1', 'admin', { reason: 'salah input nilai' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to revise a revoked report', async () => {
      repo.findForPdf.mockResolvedValue(document({ status: 'REVOKED' }));
      await expect(
        service.revise('r1', 'admin', { reason: 'salah input nilai' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the next revision with the same number and verify code', async () => {
      repo.findForPdf.mockResolvedValue(document());
      repo.supersede.mockResolvedValue({} as never);

      const result = await service.revise('r1', 'admin', {
        reason: 'salah input nilai',
        ratings: { 'intellectual.logic': 'T' },
      });

      expect(result).toMatchObject({
        number: '050/PSIKOTES/YM/XI/2026',
        revision: 2,
        status: 'ACTIVE',
        supersedesId: 'r1',
      });
      expect(repo.supersede).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          revision: 2,
          verifyCode: 'ABCD123456',
          recommendation: 'LAYAK',
        }),
      );
    });

    it('merges the correction into the frozen snapshot', async () => {
      repo.findForPdf.mockResolvedValue(document());
      repo.supersede.mockResolvedValue({} as never);

      await service.revise('r1', 'admin', {
        reason: 'salah input nilai',
        ratings: { 'intellectual.logic': 'T' },
      });

      const patch = repo.supersede.mock.calls[0][1];
      expect(patch.snapshot.ratings['intellectual.logic']).toBe('T');
      expect(patch.snapshot.ratings['intellectual.analysis']).toBe('B');
      expect(patch.snapshot.holder.name).toBe('Budi');
    });

    it('keeps the current recommendation when the payload omits it', async () => {
      repo.findForPdf.mockResolvedValue(document());
      repo.supersede.mockResolvedValue({} as never);

      await service.revise('r1', 'admin', { reason: 'salah input nilai' });

      expect(repo.supersede.mock.calls[0][1].recommendation).toBe('LAYAK');
    });
  });

  describe('revoke', () => {
    it('rejects a reason shorter than 10 characters', async () => {
      await expect(
        service.revoke('r1', 'admin', 'salah'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws 404 for an unknown report', async () => {
      repo.findForPdf.mockResolvedValue(null);
      await expect(
        service.revoke('r1', 'admin', 'salah input nilai'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to revoke a superseded report', async () => {
      repo.findForPdf.mockResolvedValue(document({ status: 'SUPERSEDED' }));
      await expect(
        service.revoke('r1', 'admin', 'salah input nilai'),
      ).rejects.toMatchObject({ message: 'report_superseded' });
    });

    it('marks the report revoked with the reason and the admin id', async () => {
      repo.findForPdf.mockResolvedValue(document());
      repo.revoke.mockResolvedValue({} as never);

      const result = await service.revoke(
        'r1',
        'admin',
        '  salah input nilai  ',
      );

      expect(result.status).toBe('REVOKED');
      expect(repo.revoke).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          reason: 'salah input nilai',
          revokedById: 'admin',
        }),
      );
    });
  });

  describe('backfill', () => {
    it('counts the backlog on a dry run without writing', async () => {
      repo.findBackfillCandidates.mockResolvedValue(['p1', 'p2']);

      const result = await service.backfill({ dryRun: true });

      expect(result).toEqual({
        scanned: 2,
        created: 0,
        skipped: 0,
        dryRun: true,
      });
      expect(repo.createDraft).not.toHaveBeenCalled();
    });

    it('creates one empty draft per candidate', async () => {
      repo.findBackfillCandidates.mockResolvedValue(['p1', 'p2']);
      repo.createDraft.mockResolvedValue({} as never);

      const result = await service.backfill({ dryRun: false });

      expect(result).toEqual({
        scanned: 2,
        created: 2,
        skipped: 0,
        dryRun: false,
      });
      expect(repo.createDraft).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          ratings: {},
          narratives: {},
          recommendation: null,
          filledById: null,
        }),
      );
    });

    it('is a no-op on the second run', async () => {
      repo.findBackfillCandidates.mockResolvedValue([]);

      const result = await service.backfill({ dryRun: false });

      expect(result.created).toBe(0);
      expect(repo.createDraft).not.toHaveBeenCalled();
    });

    it('counts a participant who was claimed mid-run as skipped', async () => {
      repo.findBackfillCandidates.mockResolvedValue(['p1', 'p2']);
      repo.createDraft
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce({ code: 'P2002' });

      const result = await service.backfill({ dryRun: false });

      expect(result).toEqual({
        scanned: 2,
        created: 1,
        skipped: 1,
        dryRun: false,
      });
    });

    it('scopes the scan to one session when asked', async () => {
      repo.findBackfillCandidates.mockResolvedValue([]);

      await service.backfill({
        sessionId: '6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b',
        dryRun: true,
      });

      expect(repo.findBackfillCandidates).toHaveBeenCalledWith({
        sessionId: '6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b',
      });
    });
  });
});
