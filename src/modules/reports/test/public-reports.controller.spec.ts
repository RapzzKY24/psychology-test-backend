/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */
import 'reflect-metadata';

jest.mock('@thallesp/nestjs-better-auth', () => {
  const { SetMetadata } = jest.requireActual('@nestjs/common');
  return {
    AllowAnonymous: () => SetMetadata('PUBLIC', true),
  };
});

import { PublicReportsController } from '../controller/public-reports.controller';
import { PublicReportsService } from '../service/public-reports.service';

describe('PublicReportsController wiring', () => {
  const service = { verify: jest.fn() } as unknown as PublicReportsService;
  const controller = new PublicReportsController(service);

  it('marks the verify route anonymous', () => {
    const isPublic = Reflect.getMetadata(
      'PUBLIC',
      PublicReportsController.prototype.verify,
    ) as unknown;
    expect(isPublic).toBe(true);
  });

  it('falls back to a shared bucket when the IP is unknown', async () => {
    (service.verify as jest.Mock).mockResolvedValue({ valid: false });

    await controller.verify('abcd123456', '');

    expect(service.verify).toHaveBeenCalledWith('abcd123456', 'unknown');
  });

  it('passes the client IP through', async () => {
    (service.verify as jest.Mock).mockResolvedValue({ valid: false });

    await controller.verify('abcd123456', '1.1.1.1');

    expect(service.verify).toHaveBeenCalledWith('abcd123456', '1.1.1.1');
  });
});
