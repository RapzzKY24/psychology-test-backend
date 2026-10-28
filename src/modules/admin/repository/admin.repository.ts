import type {
  PsychologistProfile,
  UserRole,
} from '../../../generated/prisma/client';

export const ADMIN_REPOSITORY = 'AdminRepository';

/** Columns the admin console is allowed to read back. */
export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

export interface CreateUserInput {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
}

export interface CreatePsychologistInput {
  userId: string;
  name: string;
  email: string;
  nik: string;
  institutionName: string;
  passwordHash: string;
}

export interface AdminRepository {
  findUsers(params: {
    role?: UserRole;
    skip: number;
    take: number;
  }): Promise<{ data: AdminUserRow[]; total: number }>;
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  findUserById(id: string): Promise<{ id: string } | null>;
  findProfileByNik(nik: string): Promise<{ id: string } | null>;
  /** user + credential account, atomic. */
  createUserWithAccount(input: CreateUserInput): Promise<AdminUserRow>;
  /** user + credential account + psychologist profile, atomic. */
  createPsychologistWithAccount(
    input: CreatePsychologistInput,
  ): Promise<{ user: AdminUserRow; profile: PsychologistProfile }>;
  updateUserRole(userId: string, role: UserRole): Promise<AdminUserRow>;
}
