import type { PsychologistProfile } from '../../../generated/prisma/client';

/**
 * Approval gate: every credential the review flow needs must be present.
 * Degree stays optional (single-field name input may carry no degree part).
 */
export function isProfileComplete(profile: PsychologistProfile): boolean {
  return (
    !!profile.fullName &&
    !!profile.licenseNumber &&
    !!profile.nik &&
    !!profile.institutionName &&
    !!profile.signatureImagePath
  );
}
