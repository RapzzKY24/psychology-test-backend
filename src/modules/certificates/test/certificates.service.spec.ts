import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { promises as fsPromises } from 'fs';
import type { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import { CertificatesService } from '../service/certificates.service';
import type { CertificateActor } from '../service/certificates.service';
import { EMPTY_IDENTITY } from '../repository/certificates.repository';
import type { EventLogService } from '../../event-log/service/event-log.service';
import type { CertificateDocumentService } from '../service/certificate-document.service';
import type {
  CertificateRecord,
  CertificateResultContext,
  CertificatesRepository,
} from '../repository/certificates.repository';
import type { CertificateSnapshot } from '../utils/certificate-snapshot';

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
    seq: null,
    year: null,
    revision: null,
    supersedesId: null,
    verifyCode: null,
    issuedAt: null,
    revokedAt: null,
    revokeReason: null,
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
    holderName: 'Budi',
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
  let eventLog: { record: jest.Mock; markProcessed: jest.Mock };
  let documents: { renderDocument: jest.Mock };

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByResult: jest.fn(),
      findDraftForResult: jest.fn(),
      findResultContext: jest.fn(),
      createDraft: jest.fn(),
      createRevisionDraft: jest.fn(),
      updateDraft: jest.fn(),
      setPhoto: jest.fn(),
      issue: jest.fn(),
      revoke: jest.fn(),
      findForPdf: jest.fn(),
      findForPdfInInstitution: jest.fn(),
      findForPdfForUser: jest.fn(),
      listIssuedByUser: jest.fn(),
      listCertificates: jest.fn(),
      findPendingResults: jest.fn(),
      findByVerifyCode: jest.fn(),
      nextSeq: jest.fn(),
      nextRevision: jest.fn(),
      findPsychologist: jest.fn(),
      findSettings: jest.fn(),
    };
    const config = {
      get: jest.fn().mockReturnValue('./uploads'),
    } as unknown as ConfigService;
    eventLog = { record: jest.fn(), markProcessed: jest.fn() };
    documents = { renderDocument: jest.fn() };
    service = new CertificatesService(
      repo,
      config,
      eventLog as unknown as EventLogService,
      documents as unknown as CertificateDocumentService,
    );
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
        'Budi',
      );
    });

    /**
     * The seed is what makes the sign-up copy true: the account (or roster)
     * name pre-fills the document the psychologist edits.
     */
    it('seeds the draft with the holder name', async () => {
      repo.findResultContext.mockResolvedValue(
        context({ participantName: null, holderName: 'Siti' }),
      );
      repo.findDraftForResult.mockResolvedValue(null);
      repo.createDraft.mockResolvedValue(record());

      await service.createDraft(OWNER.id, { resultId: 'res-1' });

      expect(repo.createDraft).toHaveBeenCalledWith(
        'res-1',
        OWNER.id,
        expect.any(Date),
        'Siti',
      );
    });

    it('seeds nothing when neither a roster row nor an account has a name', async () => {
      repo.findResultContext.mockResolvedValue(
        context({ participantName: null, holderName: null }),
      );
      repo.findDraftForResult.mockResolvedValue(null);
      repo.createDraft.mockResolvedValue(record());

      await service.createDraft(OWNER.id, { resultId: 'res-1' });

      expect(repo.createDraft).toHaveBeenCalledWith(
        'res-1',
        OWNER.id,
        expect.any(Date),
        null,
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

  describe('readPhoto', () => {
    const BYTES = Buffer.from('photo-bytes');

    beforeEach(() => {
      jest.spyOn(fsPromises, 'readFile').mockResolvedValue(BYTES);
    });

    afterEach(() => jest.restoreAllMocks());

    it('returns the bytes and their type', async () => {
      repo.findById.mockResolvedValue(
        record({ photoPath: 'uploads/certificates/me.png' }),
      );

      const result = await service.readPhoto(OWNER, 'cert-1');

      expect(result.buffer.equals(BYTES)).toBe(true);
      expect(result.type).toBe('image/png');
    });

    it('refuses a draft that has no photo yet', async () => {
      repo.findById.mockResolvedValue(record());

      await expect(service.readPhoto(OWNER, 'cert-1')).rejects.toThrow(
        new NotFoundException('photo_not_found'),
      );
    });

    it('refuses a path outside the upload directory', async () => {
      repo.findById.mockResolvedValue(record({ photoPath: '/etc/passwd' }));

      await expect(service.readPhoto(OWNER, 'cert-1')).rejects.toThrow(
        new NotFoundException('photo_not_found'),
      );
    });

    it('refuses a file that vanished from disk', async () => {
      repo.findById.mockResolvedValue(
        record({ photoPath: 'uploads/certificates/gone.png' }),
      );
      jest.spyOn(fsPromises, 'readFile').mockRejectedValue(new Error('ENOENT'));

      await expect(service.readPhoto(OWNER, 'cert-1')).rejects.toThrow(
        new NotFoundException('photo_not_found'),
      );
    });

    it('refuses a certificate owned by someone else', async () => {
      repo.findById.mockResolvedValue(
        record({ photoPath: 'uploads/certificates/me.png' }),
      );

      await expect(service.readPhoto(OTHER, 'cert-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getVerifyQr', () => {
    function withPublicUrl(publicUrl: string): CertificatesService {
      const config = {
        get: jest.fn((key: string) =>
          key === 'app.publicUrl' ? publicUrl : './uploads',
        ),
      } as unknown as ConfigService;
      return new CertificatesService(
        repo,
        config,
        eventLog as unknown as EventLogService,
        documents as unknown as CertificateDocumentService,
      );
    }

    const ISSUED = record({ status: 'ACTIVE', verifyCode: 'XMRBDYN7MU' });

    it('encodes the public page, so scanning the screen matches the paper', async () => {
      repo.findById.mockResolvedValue(ISSUED);

      const png = await withPublicUrl('https://psikologitest.id').getVerifyQr(
        OWNER,
        'cert-1',
      );

      const expected = await QRCode.toBuffer(
        'https://psikologitest.id/verifikasi-sertifikat/XMRBDYN7MU',
        { type: 'png', margin: 1, width: 320 },
      );
      expect(png.equals(expected)).toBe(true);
    });

    it('ignores a trailing slash on the configured URL', async () => {
      repo.findById.mockResolvedValue(ISSUED);

      const png = await withPublicUrl('https://psikologitest.id/').getVerifyQr(
        OWNER,
        'cert-1',
      );

      const expected = await QRCode.toBuffer(
        'https://psikologitest.id/verifikasi-sertifikat/XMRBDYN7MU',
        { type: 'png', margin: 1, width: 320 },
      );
      expect(png.equals(expected)).toBe(true);
    });

    it('refuses a draft that has no code yet', async () => {
      repo.findById.mockResolvedValue(record());

      await expect(
        withPublicUrl('https://x.test').getVerifyQr(OWNER, 'cert-1'),
      ).rejects.toThrow(new NotFoundException('verify_code_not_assigned'));
    });

    it('refuses to draw a code that no phone could read', async () => {
      repo.findById.mockResolvedValue(ISSUED);

      await expect(
        withPublicUrl('').getVerifyQr(OWNER, 'cert-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('refuses a certificate owned by someone else', async () => {
      repo.findById.mockResolvedValue(ISSUED);

      await expect(
        withPublicUrl('https://x.test').getVerifyQr(OTHER, 'cert-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('issue', () => {
    const profile = {
      fullName: 'Dr. Ani',
      degree: 'M.Psi.',
      licenseNumber: '123',
      sippNumber: '456',
      nik: '3201',
      institutionName: 'Klinik',
      signatureImagePath: 'uploads/sig.png',
    };

    function ready(over: Partial<CertificateRecord> = {}): CertificateRecord {
      return record({
        verdict: 'MEMENUHI_SYARAT',
        purpose: 'CPMI',
        validUntil: new Date('2027-12-31T00:00:00+07:00'),
        photoPath: 'uploads/certificates/photo.png',
        identity: {
          fullName: 'Budi',
          idNumber: '3201010101960001',
          gender: 'LAKI_LAKI',
          birthPlace: 'Bandung',
          birthDate: '1996-01-01',
          age: 30,
          address: 'Jl. Merdeka 1',
        },
        ...over,
      });
    }

    function primeHappyPath(): void {
      repo.findById.mockResolvedValue(ready());
      repo.findPsychologist.mockResolvedValue(
        profile as unknown as Awaited<
          ReturnType<CertificatesRepository['findPsychologist']>
        >,
      );
      repo.findResultContext.mockResolvedValue(context());
      repo.findSettings.mockResolvedValue({
        'report.institution_code': 'YM',
        'certificate.city': 'Bandung',
      });
      repo.nextRevision.mockResolvedValue(1);
      repo.nextSeq.mockResolvedValue(50);
      repo.issue.mockResolvedValue(ready({ status: 'ACTIVE' }));
    }

    it('assigns the first number of the series and flips the row to ACTIVE', async () => {
      primeHappyPath();

      const issued = await service.issue(OWNER, 'cert-1');

      expect(issued.number).toMatch(/^050\/KRAEPELIN\/YM\//);
      expect(issued.revision).toBe(1);
      expect(issued.status).toBe('ACTIVE');
      expect(issued.verifyCode).toHaveLength(10);
    });

    it('freezes a snapshot the renderer can draw without the live rows', async () => {
      primeHappyPath();

      await service.issue(OWNER, 'cert-1');

      const patch = repo.issue.mock.calls[0][1];
      expect(patch.snapshot).toMatchObject({
        test: { name: 'Tes Kraepelin', slug: 'kraepelin' },
        verdict: 'MEMENUHI_SYARAT',
        purpose: 'CPMI',
        validUntil: '2027-12-31',
        city: 'Bandung',
        issuer: { fullName: 'Dr. Ani', signaturePath: 'uploads/sig.png' },
        photoPath: 'uploads/certificates/photo.png',
      });
    });

    /**
     * Regression: the template prints SIPP NO, but profiles created before the
     * sippNumber column only carry licenseNumber. A blank line under a printed
     * label is the bug; the licence number is the same credential.
     */
    it('falls back to the licence number when the profile has no SIPP', async () => {
      primeHappyPath();
      repo.findPsychologist.mockResolvedValue({
        ...profile,
        sippNumber: null,
      } as unknown as Awaited<
        ReturnType<CertificatesRepository['findPsychologist']>
      >);

      await service.issue(OWNER, 'cert-1');

      const patch = repo.issue.mock.calls[0][1];
      const snapshot = patch.snapshot as CertificateSnapshot;
      expect(snapshot.issuer.sippNumber).toBe('123');
    });

    it('refuses a second issue of the same certificate', async () => {
      repo.findById.mockResolvedValue(ready({ status: 'ACTIVE' }));

      await expect(service.issue(OWNER, 'cert-1')).rejects.toThrow(
        new ConflictException('already_issued'),
      );
    });

    it('refuses to issue without a photo', async () => {
      repo.findById.mockResolvedValue(ready({ photoPath: null }));

      await expect(service.issue(OWNER, 'cert-1')).rejects.toThrow(
        new BadRequestException('photo_required'),
      );
    });

    it('lists every field that is still empty', async () => {
      repo.findById.mockResolvedValue(ready({ purpose: null, verdict: null }));

      const error = await service
        .issue(OWNER, 'cert-1')
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        message: string;
        details: string[];
      };
      expect(body.message).toBe('incomplete_draft');
      expect(body.details).toEqual(['verdict', 'purpose']);
    });

    it('refuses when the psychologist profile is incomplete', async () => {
      repo.findById.mockResolvedValue(ready());
      repo.findPsychologist.mockResolvedValue(null);

      await expect(service.issue(OWNER, 'cert-1')).rejects.toThrow(
        new UnprocessableEntityException('profile_incomplete'),
      );
    });

    it('keeps the number of the revision it corrects', async () => {
      repo.findById.mockResolvedValue(
        ready({
          supersedesId: 'cert-0',
          number: '050/KRAEPELIN/YM/XI/2026',
          seq: 50,
          year: 2026,
        }),
      );
      repo.findPsychologist.mockResolvedValue(
        profile as unknown as Awaited<
          ReturnType<CertificatesRepository['findPsychologist']>
        >,
      );
      repo.findResultContext.mockResolvedValue(context());
      repo.findSettings.mockResolvedValue({
        'report.institution_code': 'YM',
        'certificate.city': 'Bandung',
      });
      repo.nextRevision.mockResolvedValue(2);
      repo.issue.mockResolvedValue(ready({ status: 'ACTIVE' }));

      const issued = await service.issue(OWNER, 'cert-1');

      expect(issued.number).toBe('050/KRAEPELIN/YM/XI/2026');
      expect(issued.revision).toBe(2);
      expect(repo.nextSeq).not.toHaveBeenCalled();
    });
  });

  describe('createRevision', () => {
    it('refuses a certificate that is not active', async () => {
      repo.findById.mockResolvedValue(record({ status: 'DRAFT' }));

      await expect(service.createRevision(OWNER, 'cert-1')).rejects.toThrow(
        new ConflictException('certificate_not_active'),
      );
    });

    it('returns the draft that is already open instead of a second one', async () => {
      const open = record();
      repo.findById.mockResolvedValue(record({ status: 'ACTIVE' }));
      repo.findDraftForResult.mockResolvedValue(open);

      await expect(service.createRevision(OWNER, 'cert-1')).resolves.toBe(open);
      expect(repo.createRevisionDraft).not.toHaveBeenCalled();
    });

    it('opens a draft that supersedes the active certificate', async () => {
      const active = record({ status: 'ACTIVE' });
      repo.findById.mockResolvedValue(active);
      repo.findDraftForResult.mockResolvedValue(null);
      repo.createRevisionDraft.mockResolvedValue(record());

      await service.createRevision(OWNER, 'cert-1');

      expect(repo.createRevisionDraft).toHaveBeenCalledWith(
        active,
        OWNER.id,
        expect.any(Date),
      );
    });
  });

  describe('revoke', () => {
    it('rejects a reason that says nothing', async () => {
      await expect(service.revoke(ADMIN, 'cert-1', 'salah')).rejects.toThrow(
        new UnprocessableEntityException('reason_too_short'),
      );
    });

    it('refuses to revoke something that is not active', async () => {
      repo.findById.mockResolvedValue(record({ status: 'DRAFT' }));

      await expect(
        service.revoke(ADMIN, 'cert-1', 'salah input data peserta'),
      ).rejects.toThrow(new ConflictException('certificate_not_active'));
    });

    it('hides a certificate that belongs to another psychologist', async () => {
      repo.findById.mockResolvedValue(record({ status: 'ACTIVE' }));

      await expect(
        service.revoke(OTHER, 'cert-1', 'salah input data peserta'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets the signing psychologist withdraw their own certificate', async () => {
      repo.findById.mockResolvedValue(record({ status: 'ACTIVE' }));
      repo.revoke.mockResolvedValue(record({ status: 'REVOKED' }));
      eventLog.record.mockResolvedValue({ id: 'evt-1' });
      eventLog.markProcessed.mockResolvedValue(undefined);

      await expect(
        service.revoke(OWNER, 'cert-1', 'salah input data peserta'),
      ).resolves.toMatchObject({ status: 'REVOKED' });
    });

    it('withdraws the certificate and records who did it', async () => {
      repo.findById.mockResolvedValue(
        record({ status: 'ACTIVE', number: '060/TES/YM/XI/2026' }),
      );
      repo.revoke.mockResolvedValue(record({ status: 'REVOKED' }));
      eventLog.record.mockResolvedValue({ id: 'evt-1' });
      eventLog.markProcessed.mockResolvedValue(undefined);

      await service.revoke(ADMIN, 'cert-1', 'salah input data peserta');

      expect(repo.revoke).toHaveBeenCalledWith(
        'cert-1',
        expect.objectContaining({
          reason: 'salah input data peserta',
          revokedById: ADMIN.id,
        }),
      );
      expect(eventLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'certificate.revoked',
          aggregateType: 'Certificate',
          aggregateId: 'cert-1',
        }),
      );
    });
  });

  describe('list', () => {
    it('scopes a psychologist to their own rows', async () => {
      repo.listCertificates.mockResolvedValue({ total: 0, data: [] });

      await service.list(OWNER, { page: 1, limit: 10 });

      expect(repo.listCertificates).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        ownerId: OWNER.id,
        status: undefined,
      });
    });

    it('lets an admin see every row', async () => {
      repo.listCertificates.mockResolvedValue({ total: 0, data: [] });

      await service.list(ADMIN, { page: 3, limit: 5, status: 'ACTIVE' });

      expect(repo.listCertificates).toHaveBeenCalledWith({
        skip: 10,
        take: 5,
        ownerId: undefined,
        status: 'ACTIVE',
      });
    });
  });

  describe('listPending', () => {
    it('pages the work queue the same way the report queue does', async () => {
      repo.findPendingResults.mockResolvedValue({
        total: 12,
        data: [
          {
            resultId: 'res-1',
            testName: 'Tes Kraepelin',
            testSlug: 'kraepelin',
            participantName: 'Budi',
            approvedAt: new Date('2026-11-01T00:00:00Z'),
            sessionTitle: 'Batch 1',
          },
        ],
      });

      const result = await service.listPending({ page: 2, limit: 5 });

      expect(repo.findPendingResults).toHaveBeenCalledWith({
        skip: 5,
        take: 5,
      });
      expect(result.meta).toEqual({
        page: 2,
        limit: 5,
        total: 12,
        totalPages: 3,
      });
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    const profile = {
      fullName: 'Dr. Ani',
      degree: 'M.Psi.',
      licenseNumber: '123',
      sippNumber: '456',
      nik: '3201',
      institutionName: 'Klinik',
      signatureImagePath: 'uploads/sig.png',
    };

    it('rejects an unknown certificate', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findOne(OWNER, 'cert-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('hides a draft that belongs to another psychologist', async () => {
      repo.findById.mockResolvedValue(record());

      await expect(service.findOne(OTHER, 'cert-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lists what is still missing, including the photo', async () => {
      repo.findById.mockResolvedValue(record());
      repo.findResultContext.mockResolvedValue(context());
      repo.findPsychologist.mockResolvedValue(
        profile as unknown as Awaited<
          ReturnType<CertificatesRepository['findPsychologist']>
        >,
      );

      const view = await service.findOne(OWNER, 'cert-1');

      expect(view.result).toEqual({
        resultId: 'res-1',
        testName: 'Tes Kraepelin',
        testSlug: 'kraepelin',
        participantName: 'Budi',
        sessionTitle: 'Batch 1',
      });
      expect(view.readiness.profileComplete).toBe(true);
      expect(view.readiness.missingFields).toEqual(
        expect.arrayContaining(['verdict', 'purpose', 'validUntil', 'photo']),
      );
    });

    it('reports a complete draft as ready', async () => {
      repo.findById.mockResolvedValue(
        record({
          verdict: 'MEMENUHI_SYARAT',
          purpose: 'CPMI',
          validUntil: new Date('2027-12-31T00:00:00+07:00'),
          photoPath: 'uploads/certificates/photo.png',
          identity: {
            fullName: 'Budi',
            idNumber: '3201010101960001',
            gender: 'LAKI_LAKI',
            birthPlace: 'Bandung',
            birthDate: '1996-01-01',
            age: 30,
            address: 'Jl. Merdeka 1',
          },
        }),
      );
      repo.findResultContext.mockResolvedValue(context());
      repo.findPsychologist.mockResolvedValue(
        profile as unknown as Awaited<
          ReturnType<CertificatesRepository['findPsychologist']>
        >,
      );

      const view = await service.findOne(OWNER, 'cert-1');

      expect(view.readiness.missingFields).toEqual([]);
    });
  });
});
