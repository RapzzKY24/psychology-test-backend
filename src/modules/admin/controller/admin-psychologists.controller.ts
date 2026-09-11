import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreatePsychologistSchema } from '../dto/create-psychologist.dto';
import type { CreatePsychologistDto } from '../dto/create-psychologist.dto';
import { AdminService } from '../service/admin.service';
import type { PsychologistProfile } from '../../../generated/prisma/client';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/admin/psychologists')
export class AdminPsychologistsController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @Roles(['ADMIN'])
  async createPsychologist(
    @Body(new ZodValidationPipe(CreatePsychologistSchema))
    dto: CreatePsychologistDto,
  ): Promise<
    ApiResponse<{
      user: {
        id: string;
        name: string;
        email: string;
        role: string;
        createdAt: Date;
      };
      profile: PsychologistProfile;
    }>
  > {
    const result = await this.adminService.createPsychologist(dto);
    return { data: result };
  }
}
