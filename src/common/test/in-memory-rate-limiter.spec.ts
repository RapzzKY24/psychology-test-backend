import { createRateLimiter } from '../utils/in-memory-rate-limiter';

describe('createRateLimiter', () => {
  it('allows up to limit calls per key and throws 429 beyond it', () => {
    const limiter = createRateLimiter(3, 60_000);
    limiter.check('ip1');
    limiter.check('ip1');
    limiter.check('ip1');
    expect(() => limiter.check('ip1')).toThrow('too_many_requests');
    // other keys are isolated
    expect(() => limiter.check('ip2')).not.toThrow();
  });

  it('resets after the window elapses', async () => {
    const limiter = createRateLimiter(1, 30);
    limiter.check('ip1');
    expect(() => limiter.check('ip1')).toThrow('too_many_requests');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(() => limiter.check('ip1')).not.toThrow();
  });
});
