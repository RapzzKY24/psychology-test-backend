/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */
import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ReportDocumentService } from '../service/report-document.service';
import type {
  ReportDocument,
  ReportsRepository,
} from '../repository/reports.repository';
import type { ReportAssetsService } from '../pdf/report-assets';
import { ReportAssetError } from '../pdf/report-assets';
import type { ReportPdfService } from '../pdf/report-pdf.service';
import type { ReportAssets } from '../pdf/report-html';
import { RATING_KEYS, NARRATIVE_KEYS } from '../rubric';

const assets: ReportAssets = {
  klinikLogo: 'data:image/png;base64,A',
  etpLogo: 'data:image/png;base64,B',
  mypsikologLogo: 'data:image/png;base64,C',
  tagline: 'data:image/png;base64,D',
  signature: 'data:image/png;base64,E',
  qr: 'data:image/png;base64,F',
};

function document(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    id: 'r1',
    participantId: 'p1',
    number: '050/PSIKOTES/YM/XI/2026',
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

describe('ReportDocumentService', () => {
  let service: ReportDocumentService;
  let repo: jest.Mocked<ReportsRepository>;
  let assetService: jest.Mocked<ReportAssetsService>;
  let pdfService: jest.Mocked<ReportPdfService>;

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
      findReportCandidates: jest.fn(),
    };
    assetService = {
      build: jest.fn().mockResolvedValue(assets),
    } as unknown as jest.Mocked<ReportAssetsService>;
    pdfService = {
      render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
    } as unknown as jest.Mocked<ReportPdfService>;

    service = new ReportDocumentService(repo, assetService, pdfService);
  });

  it('throws 404 for an unknown report', async () => {
    repo.findForPdf.mockResolvedValue(null);
    await expect(service.renderPdf('r1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('scopes the lookup to the institution when one is given', async () => {
    repo.findForPdfInInstitution.mockResolvedValue(document());

    await service.renderPdf('r1', { institutionId: 'inst-1' });

    expect(repo.findForPdfInInstitution).toHaveBeenCalledWith('r1', 'inst-1');
    expect(repo.findForPdf).not.toHaveBeenCalled();
  });

  it('answers 403 for a report owned by another institution', async () => {
    repo.findForPdfInInstitution.mockResolvedValue(null);

    const error = await service
      .renderPdf('r1', { institutionId: 'inst-1' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
  });

  it('refuses to render a revoked report', async () => {
    repo.findForPdf.mockResolvedValue(document({ status: 'REVOKED' }));
    const error = await service.renderPdf('r1').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('report_revoked');
  });

  it('refuses to render a superseded report', async () => {
    repo.findForPdf.mockResolvedValue(document({ status: 'SUPERSEDED' }));
    await expect(service.renderPdf('r1')).rejects.toMatchObject({
      message: 'report_superseded',
    });
  });

  it('refuses to render a draft', async () => {
    repo.findForPdf.mockResolvedValue(document({ status: 'DRAFT' }));
    await expect(service.renderPdf('r1')).rejects.toMatchObject({
      message: 'report_draft',
    });
  });

  it('builds the PDF and a filename from the number', async () => {
    repo.findForPdf.mockResolvedValue(document());

    const result = await service.renderPdf('r1');

    expect(result.filename).toBe('laporan-050-PSIKOTES-YM-XI-2026.pdf');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(pdfService.render).toHaveBeenCalledWith(
      expect.stringContaining('050/PSIKOTES/YM/XI/2026'),
    );
  });

  it('asks for assets using the frozen signature path', async () => {
    repo.findForPdf.mockResolvedValue(document());
    await service.renderPdf('r1');
    expect(assetService.build).toHaveBeenCalledWith({
      verifyCode: 'ABCD123456',
      signaturePath: 'uploads/sig.png',
    });
  });

  it('maps a missing signature to a 500', async () => {
    repo.findForPdf.mockResolvedValue(document());
    assetService.build.mockRejectedValue(
      new ReportAssetError('report_signature_missing'),
    );

    const error = await service.renderPdf('r1').catch((e) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(error.message).toBe('report_signature_missing');
  });

  it('does not render when the assets fail', async () => {
    repo.findForPdf.mockResolvedValue(document());
    assetService.build.mockRejectedValue(new Error('disk gone'));

    await expect(service.renderPdf('r1')).rejects.toThrow('disk gone');
    expect(pdfService.render).not.toHaveBeenCalled();
  });
});
