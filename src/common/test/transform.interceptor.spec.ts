import { StreamableFile } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { TransformInterceptor } from '../interceptors/transform.interceptor';

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor<unknown>();
  const context = {} as ExecutionContext;

  const run = (value: unknown) =>
    firstValueFrom(
      interceptor.intercept(context, {
        handle: () => of(value),
      }),
    );

  it('wraps a plain payload in { data }', async () => {
    await expect(run({ id: 'inv1' })).resolves.toEqual({
      data: { id: 'inv1' },
    });
  });

  it('leaves an already enveloped payload alone', async () => {
    await expect(run({ data: 'x' })).resolves.toEqual({ data: 'x' });
  });

  it('passes a StreamableFile through untouched', async () => {
    const file = new StreamableFile(Buffer.from('%PDF-'));
    await expect(run(file)).resolves.toBe(file);
  });
});
