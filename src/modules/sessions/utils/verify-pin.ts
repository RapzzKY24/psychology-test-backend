import bcrypt from 'bcryptjs';

/**
 * Timing-safe PIN verification against the bcrypt hash stored on the session.
 */
export function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  return bcrypt.compare(pin, pinHash);
}
