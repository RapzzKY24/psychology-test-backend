import { Controller, Get } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { TestsService } from '../../tests/service/tests.service';
import type { PublicTestDto } from '../../tests/dto/public-test.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/instansi/tests')
export class InstansiTestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  @Roles(['INSTANSI'])
  async listForInstansi(): Promise<PaginatedResponse<PublicTestDto>> {
    // Whitelist: instansi only sees WPT (CPMI is an alias of it).
    return this.testsService.findManyPublicFiltered({ slug: 'wpt' });
  }
}
