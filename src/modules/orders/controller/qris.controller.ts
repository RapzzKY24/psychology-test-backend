import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '@thallesp/nestjs-better-auth';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { validateQrisFile } from '../utils/validate-qris-file';
import { QrisService } from '../service/qris.service';
import type { ApiResponse } from '../../../common/interfaces/api-response.interface';
import type { Response } from 'express';

@Controller('api/v1')
export class QrisController {
  constructor(private readonly qrisService: QrisService) {}

  @Post('admin/payments/qris')
  @Roles(['ADMIN'])
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponse<{ qrisImageUrl: string }>> {
    validateQrisFile(file);
    const data = await this.qrisService.saveImage(file);
    return { data };
  }

  @Get('public/payments/qris-image')
  @AllowAnonymous()
  async stream(@Res() res: Response): Promise<void> {
    const filePath = await this.qrisService.getImagePath();
    res.sendFile(filePath);
  }
}
