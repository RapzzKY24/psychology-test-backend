import { buildReportSnapshot } from '../utils/report-snapshot';
import type {
  ReportParticipantContext,
  ReportRecord,
} from '../repository/reports.repository';
import type { PsychologistProfile } from '../../../generated/prisma/client';

const context: ReportParticipantContext = {
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
      completedAt: new Date('2026-01-11T02:00:00Z'),
    },
    {
      testName: 'IST',
      patternCode: 'C',
      status: 'APPROVED',
      completedAt: new Date('2026-01-12T02:00:00Z'),
    },
  ],
};

const report: ReportRecord = {
  id: 'r1',
  participantId: 'p1',
  status: 'DRAFT',
  ratings: { 'intellectual.logic': 'B' },
  narratives: { overall: 'Baik.' },
  recommendation: 'LAYAK',
  number: null,
  issuedAt: null,
  updatedAt: new Date(),
};

const profile = {
  fullName: 'Faradila Ishara Lestari',
  degree: 'M.Psi, Psikolog',
  licenseNumber: '25022211674',
  sippNumber: null,
  signatureImagePath: 'signatures/a.png',
} as unknown as PsychologistProfile;

describe('buildReportSnapshot', () => {
  const issuedAt = new Date('2026-11-02T03:15:00Z');
  const build = () =>
    buildReportSnapshot({
      context,
      report,
      profile,
      institutionName: 'YULIARPAN MEDIKA/ETP',
      issuedAt,
    });

  it('copies the participant identity and computes the age', () => {
    expect(build().holder).toEqual({
      name: 'Budi Santoso',
      age: 27,
      education: 'SMA/SMK',
      destination: 'Taiwan',
    });
  });

  it('uses the latest test completion as the assessment date', () => {
    expect(build().examDate).toBe('2026-01-12');
  });

  it('falls back to the issue date when no test has a completion time', () => {
    const snapshot = buildReportSnapshot({
      context: {
        ...context,
        tests: context.tests.map((t) => ({ ...t, completedAt: null })),
      },
      report,
      profile,
      institutionName: 'YULIARPAN MEDIKA/ETP',
      issuedAt,
    });
    expect(snapshot.examDate).toBe('2026-11-02');
  });

  it('keeps the signature path and a null SIPP as-is', () => {
    expect(build().assessor).toEqual({
      fullName: 'Faradila Ishara Lestari',
      degree: 'M.Psi, Psikolog',
      licenseNumber: '25022211674',
      sippNumber: null,
      signaturePath: 'signatures/a.png',
    });
  });

  it('copies ratings, narratives and recommendation untouched', () => {
    const snapshot = build();
    expect(snapshot.ratings).toEqual(report.ratings);
    expect(snapshot.narratives).toEqual(report.narratives);
    expect(snapshot.recommendation).toBe('LAYAK');
  });

  it('records only the test names and effective patterns', () => {
    expect(build().tests).toEqual([
      { name: 'DISC', patternCode: 'I' },
      { name: 'IST', patternCode: 'C' },
    ]);
  });

  it('refuses to build without a recommendation', () => {
    expect(() =>
      buildReportSnapshot({
        context,
        report: { ...report, recommendation: null },
        profile,
        institutionName: 'YULIARPAN MEDIKA/ETP',
        issuedAt,
      }),
    ).toThrow(/recommendation/);
  });
});
