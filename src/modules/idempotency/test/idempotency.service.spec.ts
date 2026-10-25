/* eslint-disable @typescript-eslint/unbound-method */
import { IdempotencyService } from '../service/idempotency.service';
import { IdempotencyInProgressError } from '../errors/idempotency.error';
import type {
  IdempotencyRecord,
  IdempotencyRepository,
} from '../repository/idempotency.repository';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockRepo: jest.Mocked<IdempotencyRepository>;

  const record: IdempotencyRecord = {
    id: 'rec1',
    key: 'jokul.va.callback:123:ref1',
    scope: 'jokul.va.callback',
    requestHash: null,
    status: 'IN_PROGRESS',
    responseStatus: null,
    responseBody: null,
    errorMessage: null,
    lockedAt: new Date(),
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findByKey: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
    };
    service = new IdempotencyService(mockRepo);
  });

  describe('begin', () => {
    it('acquires the key when the insert succeeds', async () => {
      mockRepo.create.mockResolvedValue(record);

      const result = await service.begin({
        scope: 'jokul.va.callback',
        key: 'jokul.va.callback:123:ref1',
      });

      expect(result).toEqual({ acquired: true, id: 'rec1' });
      expect(mockRepo.create).toHaveBeenCalledWith({
        key: 'jokul.va.callback:123:ref1',
        scope: 'jokul.va.callback',
        requestHash: undefined,
        expiresAt: undefined,
      });
    });

    it('computes expiresAt from ttlMinutes', async () => {
      mockRepo.create.mockResolvedValue(record);

      await service.begin({
        scope: 'jokul.va.create',
        key: 'ext1',
        ttlMinutes: 30,
      });

      const arg = mockRepo.create.mock.calls[0][0];
      expect(arg.expiresAt).toBeInstanceOf(Date);
      expect(arg.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('returns the existing claim on a duplicate key (P2002)', async () => {
      const dup = Object.assign(new Error('unique'), { code: 'P2002' });
      mockRepo.create.mockRejectedValue(dup);
      mockRepo.findByKey.mockResolvedValue(record);

      const result = await service.begin({
        scope: 'jokul.va.callback',
        key: 'jokul.va.callback:123:ref1',
      });

      expect(result).toEqual({ acquired: false, existing: record });
      expect(mockRepo.findByKey).toHaveBeenCalledWith(
        'jokul.va.callback:123:ref1',
      );
    });

    it('rethrows the P2002 error when the existing row cannot be found', async () => {
      const dup = Object.assign(new Error('unique'), { code: 'P2002' });
      mockRepo.create.mockRejectedValue(dup);
      mockRepo.findByKey.mockResolvedValue(null);

      await expect(
        service.begin({ scope: 'jokul.va.callback', key: 'k' }),
      ).rejects.toThrow('unique');
    });

    it('propagates non-conflict errors', async () => {
      mockRepo.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.begin({ scope: 'jokul.va.callback', key: 'k' }),
      ).rejects.toThrow('db down');
    });
  });

  it('complete delegates to the repository', async () => {
    mockRepo.complete.mockResolvedValue(undefined);

    await service.complete('rec1', {
      responseStatus: 200,
      responseBody: { ok: true },
    });

    expect(mockRepo.complete).toHaveBeenCalledWith('rec1', {
      responseStatus: 200,
      responseBody: { ok: true },
    });
  });

  it('fail delegates to the repository with the reason', async () => {
    mockRepo.fail.mockResolvedValue(undefined);

    await service.fail('rec1', { errorMessage: 'boom' });

    expect(mockRepo.fail).toHaveBeenCalledWith('rec1', {
      errorMessage: 'boom',
    });
  });

  describe('run', () => {
    it('runs fn once and marks the key completed', async () => {
      mockRepo.create.mockResolvedValue(record);
      mockRepo.complete.mockResolvedValue(undefined);
      const fn = jest.fn().mockResolvedValue({ ok: true });

      const value = await service.run(
        { scope: 'jokul.va.create', key: 'ext1' },
        fn,
      );

      expect(value).toEqual({ ok: true });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(mockRepo.complete).toHaveBeenCalledWith('rec1', {
        responseStatus: 200,
        responseBody: { ok: true },
      });
    });

    it('returns the stored result on a completed duplicate', async () => {
      const dup = Object.assign(new Error('unique'), { code: 'P2002' });
      mockRepo.create.mockRejectedValue(dup);
      mockRepo.findByKey.mockResolvedValue({
        ...record,
        status: 'COMPLETED',
        responseBody: { ok: 'first' },
      });
      const fn = jest.fn();

      const value = await service.run(
        { scope: 'jokul.va.create', key: 'ext1' },
        fn,
      );

      expect(value).toEqual({ ok: 'first' });
      expect(fn).not.toHaveBeenCalled();
    });

    it('throws IdempotencyInProgressError on an incomplete duplicate', async () => {
      const dup = Object.assign(new Error('unique'), { code: 'P2002' });
      mockRepo.create.mockRejectedValue(dup);
      mockRepo.findByKey.mockResolvedValue(record);

      await expect(
        service.run({ scope: 'jokul.va.create', key: 'ext1' }, jest.fn()),
      ).rejects.toBeInstanceOf(IdempotencyInProgressError);
    });

    it('marks the key failed and rethrows when fn throws', async () => {
      mockRepo.create.mockResolvedValue(record);
      mockRepo.fail.mockResolvedValue(undefined);

      await expect(
        service.run({ scope: 'jokul.va.create', key: 'ext1' }, () =>
          Promise.reject(new Error('boom')),
        ),
      ).rejects.toThrow('boom');

      expect(mockRepo.fail).toHaveBeenCalledWith('rec1', {
        errorMessage: 'boom',
      });
    });
  });
});
