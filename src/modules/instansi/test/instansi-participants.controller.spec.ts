/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import 'reflect-metadata';

// @thallesp/nestjs-better-auth ships ESM-only (.mjs) which unit-test ts-jest
// cannot load — replicate the real decorator (verified in dist: Roles =
// SetMetadata("ROLES", roles)) so this spec asserts OUR wiring, not the lib.
jest.mock('@thallesp/nestjs-better-auth', () => {
  const { SetMetadata } = jest.requireActual('@nestjs/common');
  return {
    Roles: (roles: string[]) => SetMetadata('ROLES', roles),
    Session: () => () => undefined,
    AllowAnonymous: () => () => undefined,
  };
});

import { InstansiParticipantsController } from '../controller/instansi-participants.controller';
import { InstansiParticipantsService } from '../service/instansi-participants.service';

describe('InstansiParticipantsController wiring', () => {
  it('requires the INSTANSI role (non-INSTANSI → 403 via AuthGuard)', () => {
    const roles = Reflect.getMetadata(
      'ROLES',
      InstansiParticipantsController,
    ) as unknown;

    expect(roles).toEqual(['INSTANSI']);
  });

  it('depends only on the service — no PrismaService in the controller', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      InstansiParticipantsController,
    ) as unknown[];

    expect(paramTypes).toHaveLength(1);
    expect(paramTypes[0]).toBe(InstansiParticipantsService);
  });
});
