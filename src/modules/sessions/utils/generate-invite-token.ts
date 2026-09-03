import { randomBytes } from 'crypto';

/**
 * Session invite token — 32-char URL-safe (docs/features/04-sessions-attempts.md FR#2).
 * randomBytes(24) → base64url = exactly 32 chars, unguessable, no ESM dependency (ADR-004).
 */
export function generateInviteToken(): string {
  return randomBytes(24).toString('base64url');
}
