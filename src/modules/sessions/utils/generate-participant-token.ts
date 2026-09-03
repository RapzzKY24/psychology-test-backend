import { randomBytes } from 'crypto';

/**
 * Participant token — 32-byte hex (docs/features/04-sessions-attempts.md NFR, ADR-005).
 * Returned ONCE at join; only its SHA-256 hash is stored.
 */
export function generateParticipantToken(): string {
  return randomBytes(32).toString('hex');
}
