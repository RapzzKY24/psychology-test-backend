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

import { AdminReportsController } from '../controller/admin-reports.controller';
import { AdminReportsService } from '../service/admin-reports.service';

describe('AdminReportsController wiring', () => {
  it('requires the ADMIN role', () => {
    const roles = Reflect.getMetadata(
      'ROLES',
      AdminReportsController,
    ) as unknown;
    expect(roles).toEqual(['ADMIN']);
  });

  it('depends only on the service', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      AdminReportsController,
    ) as unknown[];
    expect(paramTypes).toHaveLength(1);
    expect(paramTypes[0]).toBe(AdminReportsService);
  });
});
