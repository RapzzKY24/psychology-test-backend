export const ME_PROFILE_REPOSITORY = 'MeProfileRepository';

/**
 * The last attempt is the only place gender, education and birth date exist:
 * they are declared per attempt so a norm cannot be swapped after the items
 * were shown. The profile only reads them back.
 */
export interface ProfileLastAttempt {
  testName: string;
  startedAt: Date;
  birthDate: Date | null;
  gender: string | null;
  education: string | null;
}

export interface MeProfileData {
  name: string;
  email: string;
  phone: string | null;
  lastAttempt: ProfileLastAttempt | null;
}

export interface MeProfileUpdate {
  name?: string;
  phone?: string | null;
}

export interface MeProfileRepository {
  find(userId: string): Promise<MeProfileData | null>;
  /** False when the user row no longer exists. */
  update(userId: string, data: MeProfileUpdate): Promise<boolean>;
}
