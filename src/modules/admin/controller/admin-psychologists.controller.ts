import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreatePsychologistSchema } from '../dto/create-psychologist.dto';
import type { CreatePsychologistDto } from '../dto/create-psychologist.dto';
import { AdminService } from '../service/admin.service';

@Controller('api/v1/admin/psychologists')
export class AdminPsychologistsController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @Roles(['ADMIN'])
  async createPsychologist(
    @Body(new ZodValidationPipe(CreatePsychologistSchema))
    dto: CreatePsychologistDto,
  ) {
    const result = await this.adminService.createPsychologist(dto);
    return { data: result };
  }
}
