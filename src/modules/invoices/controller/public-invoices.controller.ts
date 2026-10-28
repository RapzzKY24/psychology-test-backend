import { Controller, Get, Param } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { InvoicesService } from '../service/invoices.service';
import {
  InvoiceVerificationParamSchema,
  type InvoiceVerificationParamDto,
} from '../dto/invoice-verification-param.dto';
import type { PublicInvoiceVerificationDto } from '../dto/public-invoice-verification.dto';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';

/**
 * Dipindai dari QR di PDF invoice. Tanpa login: HRD instansi tidak punya akun.
 */
@Controller('api/v1/invoices')
@AllowAnonymous()
export class PublicInvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('verify/:verificationToken')
  async verify(
    @Param(new ZodValidationPipe(InvoiceVerificationParamSchema))
    params: InvoiceVerificationParamDto,
  ): Promise<ApiResponse<PublicInvoiceVerificationDto>> {
    const data = await this.invoicesService.verify(params.verificationToken);
    return { data };
  }
}
