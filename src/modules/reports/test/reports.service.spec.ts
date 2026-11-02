/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ReportsService } from '../service/reports.service';
import type {
  ReportParticipantContext,
  ReportRecord,
  ReportsRepository,
} from '../repository/reports.repository';
import { NARRATIVE_KEYS, RATING_KEYS } from '../rubric';
import type { PsychologistProfile } from '../../../generated/prisma/client';

function context(
  overrides: Partial<ReportParticipantContext> = {},
): ReportParticipantContext {
  return {
    participantId: 'p1',
    participantName: 'Budi Santoso',
    sessionId: 's1',
    sessionTitle: 'Psikotes Batch November',
    institutionId: 'i1',
    birthDate: new Date(1999, 0, 11),
    education: 'SMA/SMK',
    destinationCountry: 'Taiwan',
    tests: [
      {
        testName: 'DISC',
        patternCode: 'I',
        status: 'APPROVED',
        completedAt: new Date(2026, 0, 11, 9, 0, 0),
      },
    ],
    ...overrides,
  };
}

function draft(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: 'r1',
    participantId: 'p1',
    status: 'DRAFT',
    ratings: {},
    narratives: {},
    recommendation: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

const profile = {
  id: 'ps1',
  userId: 'u1',
  fullName: 'Faradila Ishara Lestari',
  degree: 'M.Psi, Psikolog',
  licenseNumber: '25022211674',
  sippNumber: '20211226',
  nik: '3273010101900001',
  institutionName: 'YULIARPAN MEDIKA/ETP',
  signatureImagePath: 'signatures/a.png',
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as PsychologistProfile;

describe('ReportsService', () => {
  let service: ReportsService;
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
    };
    repo.findSettings.mockResolvedValue({});
    repo.nextSeq.mockResolvedValue(50);
    repo.nextRevision.mockResolvedValue(1);
    service = new ReportsService(repo);
    repo.findPsychologist.mockResolvedValue(profile);
  });

  describe('getForm', () => {
    it('throws 404 when the participant does not exist', async () => {
      repo.findParticipantContext.mockResolvedValue(null);
      await expect(service.getForm('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses individual sessions', async () => {
      repo.findParticipantContext.mockResolvedValue(
        context({ institutionId: null }),
      );
      await expect(service.getForm('u1', 'p1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('creates a draft on first open', async () => {
      repo.findParticipantContext.mockResolvedValue(context());
      repo.findActiveByParticipant.mockResolvedValue(null);
      repo.findDraftByParticipant.mockResolvedValue(null);
      repo.createDraft.mockResolvedValue(draft());

      const form = await service.getForm('u1', 'p1');

      expect(repo.createDraft).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ filledById: 'u1', recommendation: null }),
      );
      expect(form.report?.status).toBe('DRAFT');
    });

    it('reuses an existing draft instead of creating another', async () => {
      repo.findParticipantContext.mockResolvedValue(context());
      repo.findActiveByParticipant.mockResolvedValue(null);
      repo.findDraftByParticipant.mockResolvedValue(draft({ id: 'existing' }));

      const form = await service.getForm('u1', 'p1');

      expect(repo.createDraft).not.toHaveBeenCalled();
      expect(form.report?.id).toBe('existing');
    });

    it('returns an issued report without creating a draft', async () => {
      repo.findParticipantContext.mockResolvedValue(context());
      repo.findActiveByParticipant.mockResolvedValue(
        draft({ status: 'ACTIVE', recommendation: 'LAYAK' }),
      );

      const form = await service.getForm('u1', 'p1');

      expect(repo.createDraft).not.toHaveBeenCalled();
      expect(repo.findDraftByParticipant).not.toHaveBeenCalled();
      expect(form.report?.status).toBe('ACTIVE');
    });

    it('falls back to the winning row when the insert races', async () => {
      repo.findParticipantContext.mockResolvedValue(context());
      repo.findActiveByParticipant.mockResolvedValue(null);
      repo.findDraftByParticipant
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(draft({ id: 'winner' }));
      repo.createDraft.mockRejectedValue({ code: 'P2002' });

      const form = await service.getForm('u1', 'p1');

      expect(form.report?.id).toBe('winner');
    });

    it('reports the participant identity and computed age', async () => {
      repo.findParticipantContext.mockResolvedValue(context());
      repo.findActiveByParticipant.mockResolvedValue(null);
      repo.findDraftByParticipant.mockResolvedValue(draft());

      const form = await service.getForm('u1', 'p1');

      expect(form.participant).toMatchObject({
        name: 'Budi Santoso',
        education: 'SMA/SMK',
        destination: 'Taiwan',
      });
      expect(typeof form.participant.age).toBe('number');
    });

    it('lists all 20 missing fields for an empty draft', async () => {
      repo.findParticipantContext.mockResolvedValue(context());
      repo.findActiveByParticipant.mockResolvedValue(null);
      repo.findDraftByParticipant.mockResolvedValue(draft());

      const form = await service.getForm('u1', 'p1');

      expect(form.readiness.missingFields).toHaveLength(20);
    });

    it('marks testsApproved only when every test is approved', async () => {
      repo.findParticipantContext.mockResolvedValue(
        context({
          tests: [
            {
              testName: 'DISC',
              patternCode: 'I',
              status: 'APPROVED',
              completedAt: null,
            },
            {
              testName: 'IST',
              patternCode: null,
              status: 'PENDING_REVIEW',
              completedAt: null,
            },
          ],
        }),
      );
      repo.findActiveByParticipant.mockResolvedValue(null);
      repo.findDraftByParticipant.mockResolvedValue(draft());

      const form = await service.getForm('u1', 'p1');

      expect(form.readiness.testsApproved).toBe(false);
    });

    it('marks testsApproved false when no test was taken', async () => {
      repo.findParticipantContext.mockResolvedValue(context({ tests: [] }));
      repo.findActiveByParticipant.mockResolvedValue(null);
      repo.findDraftByParticipant.mockResolvedValue(draft());

      const form = await service.getForm('u1', 'p1');

      expect(form.readiness.testsApproved).toBe(false);
    });

    it('reports an incomplete profile', async () => {
      repo.findParticipantContext.mockResolvedValue(context());
      repo.findActiveByParticipant.mockResolvedValue(null);
      repo.findDraftByParticipant.mockResolvedValue(draft());
      repo.findPsychologist.mockResolvedValue(null);

      const form = await service.getForm('u1', 'p1');

      expect(form.readiness.profileComplete).toBe(false);
    });
  });

  describe('saveDraft', () => {
    beforeEach(() => {
      repo.findParticipantContext.mockResolvedValue(context());
      repo.findActiveByParticipant.mockResolvedValue(null);
    });

    it('rejects an invalid rating with 422 and details', async () => {
      await expect(
        service.saveDraft('u1', 'p1', {
          ratings: { 'intellectual.logic': 'X' },
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('rejects a narrative over 800 characters', async () => {
      await expect(
        service.saveDraft('u1', 'p1', {
          narratives: { overall: 'a'.repeat(801) },
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuses to edit an issued report', async () => {
      repo.findActiveByParticipant.mockResolvedValue(
        draft({ status: 'ACTIVE' }),
      );
      await expect(
        service.saveDraft('u1', 'p1', { ratings: {} }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('merges with what is already stored', async () => {
      repo.findDraftByParticipant.mockResolvedValue(
        draft({
          ratings: { 'intellectual.logic': 'B' },
          narratives: { overall: 'Lama.' },
        }),
      );
      repo.updateDraft.mockResolvedValue(
        draft({
          ratings: { 'intellectual.logic': 'B', 'intellectual.analysis': 'T' },
          narratives: { overall: 'Lama.' },
        }),
      );

      await service.saveDraft('u1', 'p1', {
        ratings: { 'intellectual.analysis': 'T' },
      });

      expect(repo.updateDraft).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          ratings: { 'intellectual.logic': 'B', 'intellectual.analysis': 'T' },
          narratives: { overall: 'Lama.' },
        }),
      );
    });

    it('keeps the stored recommendation when the payload omits it', async () => {
      repo.findDraftByParticipant.mockResolvedValue(
        draft({ recommendation: 'LAYAK' }),
      );
      repo.updateDraft.mockResolvedValue(draft({ recommendation: 'LAYAK' }));

      await service.saveDraft('u1', 'p1', { ratings: {} });

      expect(repo.updateDraft).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ recommendation: 'LAYAK' }),
      );
    });

    it('creates the draft first when none exists', async () => {
      repo.findDraftByParticipant.mockResolvedValue(null);
      repo.createDraft.mockResolvedValue(draft());
      repo.updateDraft.mockResolvedValue(
        draft({ ratings: { [RATING_KEYS[0]]: 'T' } }),
      );

      await service.saveDraft('u1', 'p1', {
        ratings: { [RATING_KEYS[0]]: 'T' },
      });

      expect(repo.createDraft).toHaveBeenCalled();
      expect(repo.updateDraft).toHaveBeenCalled();
    });
  });

  describe('listReports', () => {
    it('paginates and passes the filters through', async () => {
      repo.listReports.mockResolvedValue({ data: [], total: 0 });

      const result = await service.listReports({
        page: 2,
        limit: 10,
        status: 'DRAFT',
        sessionId: '11111111-1111-1111-1111-111111111111',
      });

      expect(repo.listReports).toHaveBeenCalledWith({
        skip: 10,
        take: 10,
        status: 'DRAFT',
        sessionId: '11111111-1111-1111-1111-111111111111',
      });
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it('rounds the page count up', async () => {
      repo.listReports.mockResolvedValue({ data: [], total: 21 });

      const result = await service.listReports({ page: 1, limit: 10 });

      expect(result.meta.totalPages).toBe(3);
    });
  });

  describe('issue', () => {
    function completeDraft(): ReportRecord {
      return draft({
        ratings: Object.fromEntries(RATING_KEYS.map((k) => [k, 'B'])),
        narratives: Object.fromEntries(
          NARRATIVE_KEYS.map((k) => [k, 'Cukup baik.']),
        ),
        recommendation: 'LAYAK',
      });
    }

    beforeEach(() => {
      repo.findParticipantContext.mockResolvedValue(context());
      repo.findActiveByParticipant.mockResolvedValue(null);
      repo.findDraftByParticipant.mockResolvedValue(completeDraft());
      repo.issueDraft.mockResolvedValue({
        ...completeDraft(),
        status: 'ACTIVE',
      });
    });

    it('refuses when a report is already issued', async () => {
      repo.findActiveByParticipant.mockResolvedValue(
        draft({ status: 'ACTIVE' }),
      );
      await expect(service.issue('u1', 'p1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses when there is no draft yet', async () => {
      repo.findDraftByParticipant.mockResolvedValue(null);
      await expect(service.issue('u1', 'p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses when the psychologist profile is incomplete', async () => {
      repo.findPsychologist.mockResolvedValue(null);
      await expect(service.issue('u1', 'p1')).rejects.toMatchObject({
        status: 422,
      });
    });

    it('refuses while fields are missing and names them', async () => {
      repo.findDraftByParticipant.mockResolvedValue(draft());
      const error = await service.issue('u1', 'p1').catch((e) => e);
      expect(error.getStatus()).toBe(422);
      expect(
        (error.getResponse() as { details: string[] }).details,
      ).toHaveLength(20);
    });

    it('refuses while a test is not approved', async () => {
      repo.findParticipantContext.mockResolvedValue(
        context({
          tests: [
            {
              testName: 'DISC',
              patternCode: 'I',
              status: 'PENDING_REVIEW',
              completedAt: null,
            },
          ],
        }),
      );
      const error = await service.issue('u1', 'p1').catch((e) => e);
      expect((error.getResponse() as { details: string[] }).details).toEqual([
        'tests: not_approved',
      ]);
    });

    it('refuses when the participant has no test at all', async () => {
      repo.findParticipantContext.mockResolvedValue(context({ tests: [] }));
      await expect(service.issue('u1', 'p1')).rejects.toMatchObject({
        status: 422,
      });
    });

    it('numbers the first report of the year 050', async () => {
      const issued = await service.issue('u1', 'p1');
      expect(issued.number).toMatch(
        // "PSIKOTES-BATCH-NOVEMBER" is 22 characters, so it is cut to 20.
        /^050\/PSIKOTES-BATCH-NOVEM\/YM\/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\/\d{4}$/,
      );
      expect(issued.status).toBe('ACTIVE');
      expect(issued.verifyCode).toHaveLength(10);
    });

    it('uses the institution name and code from settings when present', async () => {
      repo.findSettings.mockResolvedValue({
        'report.institution_name': 'KLINIK LAIN',
        'report.institution_code': 'KL',
      });
      repo.nextSeq.mockResolvedValue(77);

      const issued = await service.issue('u1', 'p1');

      expect(issued.number).toContain('/KL/');
      expect(issued.number.startsWith('077/')).toBe(true);
    });

    it('falls back to the default institution when settings are empty', async () => {
      repo.findSettings.mockResolvedValue({});
      await service.issue('u1', 'p1');
      expect(repo.issueDraft).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          snapshot: expect.objectContaining({
            institution: 'YULIARPAN MEDIKA/ETP',
          }),
        }),
      );
    });

    it('uses the next revision so a revoked report is never reused', async () => {
      repo.nextRevision.mockResolvedValue(2);
      const issued = await service.issue('u1', 'p1');
      expect(issued.revision).toBe(2);
    });

    it('retries with the next sequence when the number collides', async () => {
      repo.nextSeq.mockResolvedValueOnce(50).mockResolvedValueOnce(51);
      repo.issueDraft
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce({ ...completeDraft(), status: 'ACTIVE' });

      const issued = await service.issue('u1', 'p1');

      expect(repo.nextSeq).toHaveBeenCalledTimes(2);
      expect(issued.number.startsWith('051/')).toBe(true);
    });

    it('reports a conflict when the retry loses the race', async () => {
      repo.issueDraft.mockRejectedValue({ code: 'P2002' });
      repo.findActiveByParticipant
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(draft({ status: 'ACTIVE' }));

      await expect(service.issue('u1', 'p1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('freezes the participant identity into the snapshot', async () => {
      await service.issue('u1', 'p1');
      expect(repo.issueDraft).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({
          snapshot: expect.objectContaining({
            holder: expect.objectContaining({
              name: 'Budi Santoso',
              education: 'SMA/SMK',
              destination: 'Taiwan',
            }),
            assessor: expect.objectContaining({
              fullName: 'Faradila Ishara Lestari',
              licenseNumber: '25022211674',
              sippNumber: '20211226',
            }),
            recommendation: 'LAYAK',
            examDate: '2026-01-11',
          }),
        }),
      );
    });
  });
});
