/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { PrismaIdempotencyRepository } from '../repository/idempotency.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('PrismaIdempotencyRepository', () => {
  let repo: PrismaIdempotencyRepository;
  let model: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };

  const now = new Date('2026-10-17T00:00:00Z');
  const row = {
    id: 'rec1',
    key: 'gdc.va.callback:123:ref1',
    scope: 'gdc.va.callback',
    requestHash: null,
    status: 'IN_PROGRESS',
    responseStatus: null,
    responseBody: null,
    errorMessage: null,
    lockedAt: now,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    model = {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    repo = new PrismaIdempotencyRepository({
      idempotencyKey: model,
    } as unknown as PrismaService);
  });

  it('creates an IN_PROGRESS row and maps it', async () => {
    model.create.mockResolvedValue(row);

    const result = await repo.create({
      key: 'gdc.va.callback:123:ref1',
      scope: 'gdc.va.callback',
    });

    expect(model.create).toHaveBeenCalledWith({
      data: {
        key: 'gdc.va.callback:123:ref1',
        scope: 'gdc.va.callback',
        requestHash: undefined,
        expiresAt: undefined,
        lockedAt: expect.any(Date),
        status: 'IN_PROGRESS',
      },
    });
    expect(result).toEqual({
      id: 'rec1',
      key: 'gdc.va.callback:123:ref1',
      scope: 'gdc.va.callback',
      requestHash: null,
      status: 'IN_PROGRESS',
      responseStatus: null,
      responseBody: null,
      errorMessage: null,
      lockedAt: now,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('returns null when the key is not found', async () => {
    model.findUnique.mockResolvedValue(null);
    expect(await repo.findByKey('missing')).toBeNull();
  });

  it('completes with status and response body', async () => {
    model.update.mockResolvedValue(row);

    await repo.complete('rec1', {
      responseStatus: 200,
      responseBody: { ok: true },
    });

    expect(model.update).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: {
        status: 'COMPLETED',
        responseStatus: 200,
        responseBody: { ok: true },
      },
    });
  });

  it('does not overwrite responseBody when omitted', async () => {
    model.update.mockResolvedValue(row);

    await repo.complete('rec1', { responseStatus: 200 });

    const arg = model.update.mock.calls[0][0];
    expect(arg.data).not.toHaveProperty('responseBody');
  });

  it('marks the row FAILED and stores the error message', async () => {
    model.update.mockResolvedValue(row);

    await repo.fail('rec1', { errorMessage: 'boom' });

    expect(model.update).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: { status: 'FAILED', errorMessage: 'boom' },
    });
  });
});
