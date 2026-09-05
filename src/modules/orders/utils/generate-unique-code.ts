import { randomInt } from 'crypto';

export function generateUniqueCode(): number {
  return randomInt(1, 1000);
}
