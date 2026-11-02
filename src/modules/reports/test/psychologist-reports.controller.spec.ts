/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import 'reflect-metadata';

jest.mock('@thallesp/nestjs-better-auth', () => {
  const { SetMetadata } = jest.requireActual('@nestjs/common');
  return {
    Roles: (roles: string[]) => SetMetadata('ROLES', roles),
    Session: () => () => undefined,
    AllowAnonymous: () => () => undefined,
  };
});

import { PsychologistReportsController } from '../controller/psychologist-reports.controller';
import { ReportsService } from '../service/reports.service';
import { ReportDocumentService } from '../service/report-document.service';

describe('PsychologistReportsController wiring', () => {
  it('requires the PSYCHOLOGIST role', () => {
    const roles = Reflect.getMetadata(
      'ROLES',
      PsychologistReportsController,
    ) as unknown;

    expect(roles).toEqual(['PSYCHOLOGIST']);
  });

  it('depends only on the two services', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      PsychologistReportsController,
    ) as unknown[];

    expect(paramTypes).toHaveLength(2);
    expect(paramTypes[0]).toBe(ReportsService);
    expect(paramTypes[1]).toBe(ReportDocumentService);
  });
});
