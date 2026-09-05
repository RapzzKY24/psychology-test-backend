import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreateInvoiceSchema } from '../dto/create-invoice.dto';
import type { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { QueryInvoicesSchema } from '../dto/query-invoices.dto';
import type { QueryInvoicesDto } from '../dto/query-invoices.dto';
import { UpdateInvoiceStatusSchema } from '../dto/update-invoice-status.dto';
import type { UpdateInvoiceStatusDto } from '../dto/update-invoice-status.dto';
import { InvoicesService } from '../service/invoices.service';
import type {
  ApiResponse,
  PaginatedResponse,
} from '../../../common/interfaces/api-response.interface';
import type { Invoice } from '../../../generated/prisma/client';

@Controller('api/v1/admin/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Roles(['ADMIN'])
  async create(
    @Body(new ZodValidationPipe(CreateInvoiceSchema)) dto: CreateInvoiceDto,
  ): Promise<ApiResponse<Invoice>> {
    const data = await this.invoicesService.create(dto);
    return { data };
  }

  @Get()
  @Roles(['ADMIN'])
  async findMany(
    @Query(new ZodValidationPipe(QueryInvoicesSchema)) query: QueryInvoicesDto,
  ): Promise<PaginatedResponse<Invoice>> {
    const { data, total } = await this.invoicesService.findMany(query);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  @Get(':id')
  @Roles(['ADMIN'])
  async findOne(@Param('id') id: string): Promise<ApiResponse<Invoice>> {
    const data = await this.invoicesService.findById(id);
    return { data };
  }

  @Patch(':id/status')
  @Roles(['ADMIN'])
  async updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateInvoiceStatusSchema))
    dto: UpdateInvoiceStatusDto,
  ): Promise<ApiResponse<Invoice>> {
    const data = await this.invoicesService.updateStatus(
      id,
      dto.status,
      dto.notes,
    );
    return { data };
  }
}
