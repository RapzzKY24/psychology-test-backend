import bcrypt from 'bcryptjs';

/**
 * Session PIN hashing — bcrypt cost 10 (decision D6, feature 04 docs).
 * PIN is a low-entropy secret: never store/compare it plain or sha256.
 */
export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}
