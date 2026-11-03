import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { promises as fsPromises } from 'fs';
import type { ConfigService } from '@nestjs/config';
import { CertificatesService } from '../service/certificates.service';
import type { CertificateActor } from '../service/certificates.service';
import { EMPTY_IDENTITY } from '../repository/certificates.repository';
import type {
  CertificateRecord,
  CertificateResultContext,
  CertificatesRepository,
} from '../repository/certificates.repository';

const OWNER: CertificateActor = { id: 'psy-1', isAdmin: false };
const OTHER: CertificateActor = { id: 'psy-2', isAdmin: false };
const ADMIN: CertificateActor = { id: 'admin-1', isAdmin: true };

function record(over: Partial<CertificateRecord> = {}): CertificateRecord {
  return {
    id: 'cert-1',
    resultId: 'res-1',
    status: 'DRAFT',
    identity: { ...EMPTY_IDENTITY },
    verdict: null,
    purpose: null,
    validUntil: null,
    photoPath: null,
    filledById: OWNER.id,
    number: null,
    revision: null,
    verifyCode: null,
    issuedAt: null,
    revokedAt: null,
    updatedAt: new Date('2026-11-03T00:00:00Z'),
    ...over,
  };
}

function context(
  over: Partial<CertificateResultContext> = {},
): CertificateResultContext {
  return {
    resultId: 'res-1',
    status: 'APPROVED',
    testName: 'Tes Kraepelin',
    testSlug: 'kraepelin',
    participantName: 'Budi',
    sessionTitle: 'Batch 1',
    ...over,
  };
}

/* eslint-disable @typescript-eslint/unbound-method -- CertificatesRepository
   declares methods, so jest.Mocked turns each into a function-typed property;
   handing that reference to expect() is how the call is asserted. */
describe('CertificatesService', () => {
  let service: CertificatesService;
  let repo: jest.Mocked<CertificatesRepository>;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByResult: jest.fn(),
      findDraftForResult: jest.fn(),
      findResultContext: jest.fn(),
      createDraft: jest.fn(),
      updateDraft: jest.fn(),
      setPhoto: jest.fn(),
      issue: jest.fn(),
      revoke: jest.fn(),
      findForPdf: jest.fn(),
      findPendingResults: jest.fn(),
      findByVerifyCode: jest.fn(),
      nextSeq: jest.fn(),
    };
    const config = {
      get: jest.fn().mockReturnValue('./uploads'),
    } as unknown as ConfigService;
    service = new CertificatesService(repo, config);
  });

  describe('createDraft', () => {
    it('rejects an unknown result', async () => {
      repo.findResultContext.mockResolvedValue(null);

      await expect(
        service.createDraft(OWNER.id, { resultId: 'res-x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects WPT, which keeps its own document', async () => {
      repo.findResultContext.mockResolvedValue(context({ testSlug: 'wpt' }));

      await expect(
        service.createDraft(OWNER.id, { resultId: 'res-1' }),
      ).rejects.toThrow(new ConflictException('wpt_not_supported'));
    });

    it('rejects a result the psychologist has not approved', async () => {
      repo.findResultContext.mockResolvedValue(
        context({ status: 'PENDING_REVIEW' }),
      );

      await expect(
        service.createDraft(OWNER.id, { resultId: 'res-1' }),
      ).rejects.toThrow(new ConflictException('result_not_approved'));
    });

    it('returns the existing draft instead of opening a second one', async () => {
      const existing = record();
      repo.findResultContext.mockResolvedValue(context());
      repo.findDraftForResult.mockResolvedValue(existing);

      await expect(
        service.createDraft(OWNER.id, { resultId: 'res-1' }),
      ).resolves.toBe(existing);
      expect(repo.createDraft).not.toHaveBeenCalled();
    });

    it('makes the creator the owner of the new draft', async () => {
      repo.findResultContext.mockResolvedValue(context());
      repo.findDraftForResult.mockResolvedValue(null);
      repo.createDraft.mockResolvedValue(record());

      await service.createDraft(OWNER.id, { resultId: 'res-1' });

      expect(repo.createDraft).toHaveBeenCalledWith(
        'res-1',
        OWNER.id,
        expect.any(Date),
      );
    });
  });

  describe('update', () => {
    it('rejects an unknown certificate', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.update(OWNER, 'cert-1', { purpose: 'CPMI' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to edit anything that is no longer a draft', async () => {
      repo.findById.mockResolvedValue(record({ status: 'ACTIVE' }));

      await expect(
        service.update(OWNER, 'cert-1', { purpose: 'CPMI' }),
      ).rejects.toThrow(new ConflictException('certificate_not_editable'));
    });

    it('refuses a psychologist who does not own the draft', async () => {
      repo.findById.mockResolvedValue(record());

      await expect(
        service.update(OTHER, 'cert-1', { purpose: 'CPMI' }),
      ).rejects.toThrow(new ForbiddenException('certificate_not_owned'));
    });

    it('lets an admin edit a draft they do not own', async () => {
      repo.findById.mockResolvedValue(record());
      repo.updateDraft.mockResolvedValue(record({ purpose: 'CPMI' }));

      await expect(
        service.update(ADMIN, 'cert-1', { purpose: 'CPMI' }),
      ).resolves.toMatchObject({ purpose: 'CPMI' });
    });

    it('merges an identity patch into the stored block', async () => {
      repo.findById.mockResolvedValue(
        record({ identity: { ...EMPTY_IDENTITY, fullName: 'Budi' } }),
      );
      repo.updateDraft.mockResolvedValue(record());

      await service.update(OWNER, 'cert-1', {
        identity: { gender: 'LAKI_LAKI' },
      });

      const patch = repo.updateDraft.mock.calls[0][1];
      expect(patch.identity).toMatchObject({
        fullName: 'Budi',
        gender: 'LAKI_LAKI',
      });
    });

    it('leaves fields the request omits untouched', async () => {
      const verdict = 'MEMENUHI_SYARAT';
      repo.findById.mockResolvedValue(record({ verdict, purpose: 'CPMI' }));
      repo.updateDraft.mockResolvedValue(record());

      await service.update(OWNER, 'cert-1', { identity: { age: 30 } });

      expect(repo.updateDraft).toHaveBeenCalledWith(
        'cert-1',
        expect.objectContaining({ verdict, purpose: 'CPMI' }),
      );
    });

    it('clears a field that is sent as null', async () => {
      repo.findById.mockResolvedValue(record({ purpose: 'CPMI' }));
      repo.updateDraft.mockResolvedValue(record());

      await service.update(OWNER, 'cert-1', { purpose: null });

      expect(repo.updateDraft).toHaveBeenCalledWith(
        'cert-1',
        expect.objectContaining({ purpose: null }),
      );
    });

    it('derives the age from a birth date the request supplies', async () => {
      repo.findById.mockResolvedValue(record());
      repo.updateDraft.mockResolvedValue(record());
      const born = new Date();
      born.setFullYear(born.getFullYear() - 30, 0, 1);
      const iso = born.toISOString().slice(0, 10);

      await service.update(OWNER, 'cert-1', {
        identity: { birthDate: iso },
      });

      const written = repo.updateDraft.mock.calls[0][1];
      expect(written.identity.age).toBeGreaterThanOrEqual(29);
      expect(written.identity.age).toBeLessThanOrEqual(30);
    });

    it('keeps an age the psychologist typed even when a birth date is sent', async () => {
      repo.findById.mockResolvedValue(record());
      repo.updateDraft.mockResolvedValue(record());

      await service.update(OWNER, 'cert-1', {
        identity: { birthDate: '2000-01-01', age: 41 },
      });

      expect(repo.updateDraft.mock.calls[0][1].identity.age).toBe(41);
    });

    it('stores the validity date at Jakarta midnight', async () => {
      repo.findById.mockResolvedValue(record());
      repo.updateDraft.mockResolvedValue(record());

      await service.update(OWNER, 'cert-1', { validUntil: '2027-12-31' });

      expect(repo.updateDraft).toHaveBeenCalledWith(
        'cert-1',
        expect.objectContaining({
          validUntil: new Date('2027-12-31T00:00:00+07:00'),
        }),
      );
    });
  });

  describe('uploadPhoto', () => {
    const file = {
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('x'),
      originalname: 'me.exe',
    } as Express.Multer.File;

    beforeEach(() => {
      jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fsPromises, 'writeFile').mockResolvedValue(undefined);
      jest.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    it('stores the file under certificates and records the path', async () => {
      repo.findById.mockResolvedValue(record());
      repo.setPhoto.mockResolvedValue(record());

      await service.uploadPhoto(OWNER, 'cert-1', file);

      expect(repo.setPhoto).toHaveBeenCalledWith(
        'cert-1',
        expect.stringMatching(/certificates[\\/][0-9a-f-]+\.png$/),
      );
    });

    it('names the file from the mimetype, never from the client filename', async () => {
      repo.findById.mockResolvedValue(record());
      repo.setPhoto.mockResolvedValue(record());

      await service.uploadPhoto(OWNER, 'cert-1', file);

      const stored = repo.setPhoto.mock.calls[0][1];
      expect(stored?.endsWith('.png')).toBe(true);
      expect(stored).not.toContain('me.exe');
    });

    it('deletes the photo it replaces', async () => {
      const previous = 'uploads/certificates/old.png';
      repo.findById.mockResolvedValue(record({ photoPath: previous }));
      repo.setPhoto.mockResolvedValue(record());

      await service.uploadPhoto(OWNER, 'cert-1', file);

      expect(fsPromises.unlink).toHaveBeenCalledWith(previous);
    });

    it('never deletes a file outside the certificates directory', async () => {
      repo.findById.mockResolvedValue(
        record({ photoPath: 'uploads/report/logo-klinik.png' }),
      );
      repo.setPhoto.mockResolvedValue(record());

      await service.uploadPhoto(OWNER, 'cert-1', file);

      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    it('refuses a photo on a certificate that is already issued', async () => {
      repo.findById.mockResolvedValue(record({ status: 'ACTIVE' }));

      await expect(service.uploadPhoto(OWNER, 'cert-1', file)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
