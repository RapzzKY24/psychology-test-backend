import { PrismaOrdersRepository } from '../repository/orders.prisma-repository';
import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * Unit test for the unique-code collision/retry loop in
 * PrismaOrdersRepository.createWithUniqueCheck (spec NFR: transactional
 * check-then-insert, retry loop max 5 attempts → 'code_exhausted').
 */
describe('PrismaOrdersRepository — createWithUniqueCheck retry-on-collision', () => {
  let repo: PrismaOrdersRepository;
  let prisma: { $transaction: jest.Mock };
  /** Number of consecutive "collision" results the next transaction should return. */
  let collisionsLeft: number;
  /** Optional Prisma-style error code the next transaction should throw (P2002/P2034/40001). */
  let nextDbError: string | null;

  beforeEach(() => {
    collisionsLeft = 0;
    nextDbError = null;
    prisma = {
      $transaction: jest.fn(async (cb: never) => {
        const tx = {
          order: {
            findFirst: jest.fn(() => {
              if (nextDbError) {
                const e = new Error('db');
                (e as unknown as { code?: string }).code = nextDbError;
                nextDbError = null;
                throw e;
              }
              if (collisionsLeft > 0) {
                collisionsLeft -= 1;
                return { id: 'existing-order' };
              }
              return null;
            }),
            create: jest.fn(() => ({
              id: 'new-order-1',
              userId: 'u1',
              testId: 't1',
              basePrice: 200000,
              uniqueCode: 21,
              amount: 200021,
              status: 'PENDING',
            })),
          },
        };
        return (cb as unknown as (t: typeof tx) => Promise<unknown>)(tx);
      }),
    };
    repo = new PrismaOrdersRepository(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates on the first attempt when there is no collision', async () => {
    const order = await repo.createWithUniqueCheck(200000, 't1', 'u1', 60);
    expect(order.uniqueCode).toBeGreaterThanOrEqual(1);
    expect(order.uniqueCode).toBeLessThanOrEqual(999);
    expect(order.amount).toBe(200000 + order.uniqueCode);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('regenerates the code and retries after a collision', async () => {
    collisionsLeft = 1;
    const order = await repo.createWithUniqueCheck(200000, 't1', 'u1', 60);
    expect(order.uniqueCode).toBeGreaterThanOrEqual(1);
    expect(order.amount).toBe(200000 + order.uniqueCode);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('treats Prisma uniqueness/serialization errors (P2002/P2034/40001) as retryable collisions', async () => {
    nextDbError = 'P2002';
    const first = await repo.createWithUniqueCheck(200000, 't1', 'u1', 60);
    expect(first.amount).toBe(200000 + first.uniqueCode);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);

    nextDbError = 'P2034';
    const second = await repo.createWithUniqueCheck(200000, 't1', 'u1', 60);
    expect(second.amount).toBe(200000 + second.uniqueCode);
    expect(prisma.$transaction).toHaveBeenCalledTimes(4);

    nextDbError = '40001';
    const third = await repo.createWithUniqueCheck(200000, 't1', 'u1', 60);
    expect(third.amount).toBe(200000 + third.uniqueCode);
    expect(prisma.$transaction).toHaveBeenCalledTimes(6);
  });

  it('throws code_exhausted after 5 collision attempts, never creating an order', async () => {
    collisionsLeft = 5;
    await expect(
      repo.createWithUniqueCheck(200000, 't1', 'u1', 60),
    ).rejects.toThrow('code_exhausted');
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });

  it('throws code_exhausted even when DB errors keep coming', async () => {
    nextDbError = 'P2002';
    // Force P2002 for every attempt
    prisma.$transaction.mockImplementation(async (cb: never) => {
      const tx = {
        order: {
          findFirst: jest.fn(() => {
            const e = new Error('db');
            (e as unknown as { code?: string }).code = 'P2002';
            throw e;
          }),
          create: jest.fn(),
        },
      };
      return await (cb as unknown as (t: typeof tx) => Promise<unknown>)(tx);
    });
    await expect(
      repo.createWithUniqueCheck(200000, 't1', 'u1', 60),
    ).rejects.toThrow('code_exhausted');
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });

  it('propagates non-collision errors', async () => {
    prisma.$transaction.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(
      repo.createWithUniqueCheck(200000, 't1', 'u1', 60),
    ).rejects.toThrow('boom');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
