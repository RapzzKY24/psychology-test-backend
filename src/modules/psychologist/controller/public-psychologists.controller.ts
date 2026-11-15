import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PsychologistService } from '../service/psychologist.service';
import type { PublicPsychologistDto } from '../dto/public-psychologist.dto';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

/**
 * The psychologists who sign reports. The catalog has no per-test author, so
 * this is a site-level list rather than a field on `PublicTestDto`.
 */
@Controller('api/v1/psychologists')
@AllowAnonymous()
export class PublicPsychologistsController {
  constructor(private readonly psychologistService: PsychologistService) {}

  @Get()
  async findMany(): Promise<ApiResponse<PublicPsychologistDto[]>> {
    const data = await this.psychologistService.listPublic();
    return { data };
  }
}
