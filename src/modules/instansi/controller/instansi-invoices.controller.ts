import { Controller, Get, Param } from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { InstansiInvoicesService } from '../service/instansi-invoices.service';
import type { InstansiInvoiceDto } from '../dto/instansi-invoice.dto';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

@Controller('api/v1/instansi/invoices')
@Roles(['INSTANSI'])
export class InstansiInvoicesController {
  constructor(private readonly invoicesService: InstansiInvoicesService) {}

  @Get(':id')
  async getById(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<ApiResponse<InstansiInvoiceDto>> {
    const data = await this.invoicesService.getById(session.user.id, id);
    return { data };
  }
}
