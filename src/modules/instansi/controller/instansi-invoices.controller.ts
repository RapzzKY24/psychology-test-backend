import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import { InstansiInvoicesService } from '../service/instansi-invoices.service';
import type { InstansiInvoiceDto } from '../dto/instansi-invoice.dto';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/instansi/invoices')
@Roles(['INSTANSI'])
export class InstansiInvoicesController {
  constructor(private readonly invoicesService: InstansiInvoicesService) {}

  @Get()
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<InstansiInvoiceDto>> {
    return this.invoicesService.list(session.user.id, query);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.invoicesService.renderPdf(
      session.user.id,
      id,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
      length: buffer.length,
    });
  }

  @Get(':id')
  async getById(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<ApiResponse<InstansiInvoiceDto>> {
    const data = await this.invoicesService.getById(session.user.id, id);
    return { data };
  }
}
