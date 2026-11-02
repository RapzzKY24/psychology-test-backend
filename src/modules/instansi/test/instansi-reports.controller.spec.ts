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

import { InstansiReportsController } from '../controller/instansi-reports.controller';
import { InstansiReportsService } from '../service/instansi-reports.service';

describe('InstansiReportsController wiring', () => {
  it('requires the INSTANSI role', () => {
    const roles = Reflect.getMetadata(
      'ROLES',
      InstansiReportsController,
    ) as unknown;
    expect(roles).toEqual(['INSTANSI']);
  });

  it('depends only on the service', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      InstansiReportsController,
    ) as unknown[];
    expect(paramTypes).toHaveLength(1);
    expect(paramTypes[0]).toBe(InstansiReportsService);
  });
});
