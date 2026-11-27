import { Controller, Get, Param } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { InstansiTestsService } from '../service/instansi-tests.service';
import type { InstansiTestDto } from '../dto/instansi-test.dto';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/instansi/tests')
export class InstansiTestsController {
  constructor(private readonly instansiTestsService: InstansiTestsService) {}

  @Get()
  @Roles(['INSTANSI'])
  async listForInstansi(
    @Session() session: UserSession,
  ): Promise<PaginatedResponse<InstansiTestDto>> {
    // Every published test is sellable; the price is this institution's deal
    // price when one is set, otherwise the public list price.
    return this.instansiTestsService.listForInstitution(session.user.id);
  }

  @Get(':slug')
  @Roles(['INSTANSI'])
  async findOneForInstansi(
    @Session() session: UserSession,
    @Param('slug') slug: string,
  ): Promise<ApiResponse<InstansiTestDto>> {
    // The public detail page uses this instead of GET /tests/:slug when an
    // institution is signed in, so the deal price is shown everywhere.
    const data = await this.instansiTestsService.findBySlugForInstitution(
      session.user.id,
      slug,
    );
    return { data };
  }
}
