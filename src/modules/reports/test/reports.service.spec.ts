/* eslint-disable @typescript-eslint/unbound-method */
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
import { RATING_KEYS } from '../rubric';
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
    tests: [{ testName: 'DISC', patternCode: 'I', status: 'APPROVED' }],
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
    };
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
            { testName: 'DISC', patternCode: 'I', status: 'APPROVED' },
            { testName: 'IST', patternCode: null, status: 'PENDING_REVIEW' },
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
});
