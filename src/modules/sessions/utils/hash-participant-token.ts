import { createHash } from 'crypto';

/**
 * SHA-256 hex hash of a participant token — lookup key for `session_participants.tokenHash`.
 * Used by join (to store) and ParticipantTokenGuard (to resolve the header).
 */
export function hashParticipantToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
