import type { PsychologistProfile } from '../../../generated/prisma/client';

export const PSYCHOLOGIST_PROFILE_REPO = 'PsychologistProfileRepository';

export interface UpsertPsychologistProfileInput {
  fullName: string;
  degree: string;
  licenseNumber: string;
  sippNumber?: string;
  nik: string;
  institutionName: string;
}

export interface PsychologistProfileRepository {
  findByUserId(userId: string): Promise<PsychologistProfile | null>;
  /**
   * Profiles of psychologists who may still sign documents — banned accounts
   * are excluded, because their name must not appear on a public page.
   */
  findSigners(): Promise<PsychologistProfile[]>;
  upsert(
    userId: string,
    data: UpsertPsychologistProfileInput,
  ): Promise<PsychologistProfile>;
  updateSignature(
    userId: string,
    signatureImagePath: string,
  ): Promise<PsychologistProfile>;
}
