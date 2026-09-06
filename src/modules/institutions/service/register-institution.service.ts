import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { auth } from '../../auth/auth';
import type { RegisterInstitutionDto } from '../dto/register-institution.dto';

interface SignUpResult {
  response: { user: { id: string; email: string } };
  headers: Headers;
}

/**
 * Registrasi mandiri institusi (public): membuat akun role INSTANSI + row
 * Institution terhubung (ownerUserId) dalam satu alamat — session cookie
 * diterbitkan better-auth sehingga institusi langsung masuk.
 */
@Injectable()
export class RegisterInstitutionService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterInstitutionDto): Promise<{
    headers: Headers;
    user: { id: string; email: string; role: string };
    institution: { id: string; name: string; ownerUserId: string };
  }> {
    let signUp: SignUpResult;
    try {
      signUp = await auth.api.signUpEmail({
        body: {
          name: dto.companyName,
          email: dto.email,
          password: dto.password,
        },
        returnHeaders: true,
      });
    } catch (error) {
      const err = error as { status?: number; message?: string };
      // better-auth duplicate email: 422 + "already exists" message
      if (err.status === 422 && /already exists/i.test(err.message ?? '')) {
        throw new ConflictException('Email sudah terdaftar — silakan masuk.');
      }
      throw error;
    }

    const authUser = signUp.response.user;
    // better-auth creates the user as PARTICIPANT (role input: false) —
    // promote to INSTANSI here, the only path that sets this role.
    const user = await this.prisma.user.update({
      where: { id: authUser.id },
      data: { role: 'INSTANSI' },
    });

    const institution = await this.prisma.institution.create({
      data: {
        name: dto.companyName,
        contactName: dto.picName,
        contactEmail: dto.email,
        phone: dto.phone,
        address: dto.address,
        ownerUserId: user.id,
      },
    });

    return { headers: signUp.headers, user, institution };
  }
}
