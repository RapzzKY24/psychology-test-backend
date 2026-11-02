/* eslint-disable @typescript-eslint/unbound-method */
import { InstansiReportsService } from '../service/instansi-reports.service';
import type { InstansiParticipantsService } from '../service/instansi-participants.service';
import type { ReportDocumentService } from '../../reports/service/report-document.service';
import type { ReportsRepository } from '../../reports/repository/reports.repository';

describe('InstansiReportsService', () => {
  let service: InstansiReportsService;
  let repo: jest.Mocked<ReportsRepository>;
  let documents: jest.Mocked<ReportDocumentService>;
  let participants: jest.Mocked<InstansiParticipantsService>;

  beforeEach(() => {
    repo = {
      listForInstitution: jest.fn(),
    } as unknown as jest.Mocked<ReportsRepository>;
    documents = {
      renderPdf: jest.fn(),
    } as unknown as jest.Mocked<ReportDocumentService>;
    participants = {
      resolveInstitutionId: jest.fn().mockResolvedValue('inst-1'),
    } as unknown as jest.Mocked<InstansiParticipantsService>;

    service = new InstansiReportsService(repo, documents, participants);
  });

  it('scopes the list to the caller institution', async () => {
    repo.listForInstitution.mockResolvedValue({ data: [], total: 0 });

    const result = await service.list('user-1', { page: 2, limit: 5 });

    expect(participants.resolveInstitutionId).toHaveBeenCalledWith('user-1');
    expect(repo.listForInstitution).toHaveBeenCalledWith({
      institutionId: 'inst-1',
      sessionId: undefined,
      skip: 5,
      take: 5,
    });
    expect(result.meta).toEqual({
      page: 2,
      limit: 5,
      total: 0,
      totalPages: 0,
    });
  });

  it('passes the session filter through', async () => {
    repo.listForInstitution.mockResolvedValue({ data: [], total: 0 });

    await service.list('user-1', {
      page: 1,
      limit: 10,
      sessionId: '11111111-1111-1111-1111-111111111111',
    });

    expect(repo.listForInstitution).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: '11111111-1111-1111-1111-111111111111',
      }),
    );
  });

  it('renders a PDF with the institution scope', async () => {
    documents.renderPdf.mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      filename: 'laporan-x.pdf',
    });

    const result = await service.renderPdf('user-1', 'r1');

    expect(documents.renderPdf).toHaveBeenCalledWith('r1', {
      institutionId: 'inst-1',
    });
    expect(result.filename).toBe('laporan-x.pdf');
  });
});
