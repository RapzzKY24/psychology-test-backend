import type {
  Institution,
  InstitutionTestPrice,
  Prisma,
} from '../../../generated/prisma/client';

export const INSTITUTIONS_REPOSITORY = 'InstitutionsRepository';

export interface RegisterOwnerInput {
  userId: string;
  name: string;
  contactName: string;
  contactEmail: string;
  phone?: string;
  address?: string;
}

export interface RegisteredOwner {
  user: { id: string; email: string; role: string };
  institution: Institution;
}

/** A published test plus this institution's deal price (null = list price). */
export interface InstitutionTestPriceView {
  testId: string;
  name: string;
  slug: string;
  basePrice: number;
  dealPrice: number | null;
}

export interface InstitutionTestPriceRow {
  testId: string;
  price: number;
}

export interface InstitutionsRepository {
  findById(id: string): Promise<Institution | null>;
  findByOwnerUserId(ownerUserId: string): Promise<Institution | null>;
  findMany(params: {
    skip: number;
    take: number;
  }): Promise<{ data: Institution[]; total: number }>;
  create(data: Prisma.InstitutionCreateInput): Promise<Institution>;
  update(id: string, data: Prisma.InstitutionUpdateInput): Promise<Institution>;
  promoteUserAndCreateInstitution(
    input: RegisterOwnerInput,
  ): Promise<RegisteredOwner>;
  deleteUserById(userId: string): Promise<void>;
  /** Deal prices for the given tests (rows that exist only). */
  findTestPricesForTests(
    institutionId: string,
    testIds: string[],
  ): Promise<InstitutionTestPrice[]>;
  /** Every published test with this institution's deal price, for the admin editor. */
  listPublishedTestsWithPrices(
    institutionId: string,
  ): Promise<InstitutionTestPriceView[]>;
  /** Replace-all: rows not present in `rows` are removed. */
  replaceTestPrices(
    institutionId: string,
    rows: InstitutionTestPriceRow[],
  ): Promise<void>;
}
