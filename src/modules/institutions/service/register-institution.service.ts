import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { INSTITUTIONS_REPOSITORY } from '../repository/institutions.repository';
import type {
  InstitutionsRepository,
  RegisteredOwner,
} from '../repository/institutions.repository';
import { auth } from '../../auth/auth';
import { createRateLimiter } from '../../../common/utils/in-memory-rate-limiter';
import type { RegisterInstitutionDto } from '../dto/register-institution.dto';

interface SignUpResult {
  response: { user: { id: string; email: string } };
  cookies: string[];
}

export interface RegisterInstitutionResult extends RegisteredOwner {
  cookies: string[];
}

/**
 * Registrasi mandiri institusi (public): membuat akun role INSTANSI + row
 * Institution terhubung (ownerUserId). better-auth signUpEmail memakai
 * koneksi Prisma-nya sendiri sehingga di luar transaksi kita — atomicity
 * yang dijamin: promote role + create institution dalam satu $transaction
 * (repository). Jika transaksi gagal, user orphan dihapus agar retry bersih.
 */
@Injectable()
export class RegisterInstitutionService {
  private readonly logger = new Logger(RegisterInstitutionService.name);
  private readonly limiter = createRateLimiter(10, 60_000);

  constructor(
    @Inject(INSTITUTIONS_REPOSITORY)
    private readonly repo: InstitutionsRepository,
  ) {}

  async register(
    dto: RegisterInstitutionDto,
    ip: string,
  ): Promise<RegisterInstitutionResult> {
    this.limiter.check(`register-institution:${ip}`);

    let signUp: SignUpResult;
    try {
      const result = (await auth.api.signUpEmail({
        body: {
          name: dto.companyName,
          email: dto.email,
          password: dto.password,
        },
        returnHeaders: true,
      })) as {
        response: { user: { id: string; email: string } };
        headers: { getSetCookie: () => string[] };
      };
      signUp = {
        response: result.response,
        cookies: result.headers.getSetCookie(),
      };
    } catch (error) {
      // better-call APIError: `status` is a NAME string ("UNPROCESSABLE_ENTITY"),
      // the numeric code lives in `statusCode`. Verified live: duplicate email
      // throws status="UNPROCESSABLE_ENTITY", statusCode=422.
      const err = error as {
        status?: number | string;
        statusCode?: number;
        message?: string;
      };
      const statusCode =
        err.statusCode ??
        (typeof err.status === 'number' ? err.status : undefined);
      if (
        (statusCode === 400 || statusCode === 409 || statusCode === 422) &&
        /already exists|already registered|duplicate|taken/i.test(
          err.message ?? '',
        )
      ) {
        throw new ConflictException('duplicate_email');
      }
      throw error;
    }

    const authUser = signUp.response.user;
    try {
      const { user, institution } =
        await this.repo.promoteUserAndCreateInstitution({
          userId: authUser.id,
          name: dto.companyName,
          contactName: dto.picName,
          contactEmail: dto.email,
          phone: dto.phone,
          address: dto.address,
        });
      return { cookies: signUp.cookies, user, institution };
    } catch (error) {
      // Compensation: remove the orphan user so a retry starts clean.
      // Session/account rows cascade from user (schema onDelete: Cascade),
      // so the minted cookie becomes invalid — registration must be retried.
      await this.repo
        .deleteUserById(authUser.id)
        .catch((deleteError: unknown) => {
          this.logger.warn(
            `Failed to delete orphan user ${authUser.id} after failed registration: ${String(deleteError)}`,
          );
        });
      throw error;
    }
  }
}
