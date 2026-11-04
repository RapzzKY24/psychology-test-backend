import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type {
  ApiResponse,
  ErrorResponse,
} from '../../../common/interfaces/api-response.interface';
import { CreateCertificateSchema } from '../dto/create-certificate.dto';
import type { CreateCertificateDto } from '../dto/create-certificate.dto';
import { UpdateCertificateSchema } from '../dto/update-certificate.dto';
import type { UpdateCertificateDto } from '../dto/update-certificate.dto';
import { RevokeCertificateSchema } from '../dto/revoke-certificate.dto';
import type { RevokeCertificateDto } from '../dto/revoke-certificate.dto';
import { CertificatesService } from '../service/certificates.service';
import { CertificateDocumentService } from '../service/certificate-document.service';
import type {
  CertificateActor,
  CertificateFormView,
  IssuedCertificate,
} from '../service/certificates.service';
import type {
  CertificateListItem,
  CertificateRecord,
  PendingResult,
} from '../repository/certificates.repository';
import { QueryCertificatesSchema } from '../dto/query-certificates.dto';
import type { QueryCertificatesDto } from '../dto/query-certificates.dto';
import { PaginationSchema } from '../../../common/dto/pagination.dto';
import type { PaginationDto } from '../../../common/dto/pagination.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

const UuidPipe = new ZodValidationPipe(z.string().uuid());

/**
 * better-auth types the additional `role` field loosely, so it can arrive as an
 * array. The role guard has already run; this only answers "is this an admin".
 */
function actorOf(session: UserSession): CertificateActor {
  const { id, role } = session.user;
  const isAdmin = Array.isArray(role)
    ? role.includes('ADMIN')
    : role === 'ADMIN';
  return { id, isAdmin };
}

@Controller('api/v1/certificates')
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly documents: CertificateDocumentService,
  ) {}

  /** Opens (or reopens) the draft for an approved, non-WPT result. */
  @Post()
  @Roles(['PSYCHOLOGIST'])
  async create(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(CreateCertificateSchema))
    dto: CreateCertificateDto,
  ): Promise<ApiResponse<CertificateRecord>> {
    const data = await this.certificates.createDraft(session.user.id, dto);
    return { data };
  }

  /** Drafts and issued rows, newest first. */
  @Get()
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  async list(
    @Session() session: UserSession,
    @Query(new ZodValidationPipe(QueryCertificatesSchema))
    query: QueryCertificatesDto,
  ): Promise<PaginatedResponse<CertificateListItem>> {
    return this.certificates.list(actorOf(session), query);
  }

  /** Work queue — declared before `:id` so the literal wins. */
  @Get('pending')
  @Roles(['PSYCHOLOGIST'])
  async pending(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<PaginatedResponse<PendingResult>> {
    return this.certificates.listPending(query);
  }

  /** The draft editor loads this; the PDF routes are separate. */
  @Get(':id')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  async findOne(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
  ): Promise<ApiResponse<CertificateFormView>> {
    const data = await this.certificates.findOne(actorOf(session), id);
    return { data };
  }

  /** Partial save. Only the owning psychologist or an admin may call it. */
  @Patch(':id')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  async update(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCertificateSchema))
    dto: UpdateCertificateDto,
  ): Promise<ApiResponse<CertificateRecord>> {
    const data = await this.certificates.update(actorOf(session), id, dto);
    return { data };
  }

  /** Assigns the number and freezes the snapshot. */
  @Post(':id/issue')
  @Roles(['PSYCHOLOGIST'])
  async issue(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
  ): Promise<ApiResponse<IssuedCertificate>> {
    const data = await this.certificates.issue(actorOf(session), id);
    return { data };
  }

  /** Opens a draft that corrects an issued certificate. */
  @Post(':id/revision')
  @Roles(['PSYCHOLOGIST'])
  async createRevision(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
  ): Promise<ApiResponse<CertificateRecord>> {
    const data = await this.certificates.createRevision(actorOf(session), id);
    return { data };
  }

  /** The psychologist may withdraw their own; ADMIN may withdraw any. */
  @Post(':id/revoke')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  async revoke(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(RevokeCertificateSchema))
    dto: RevokeCertificateDto,
  ): Promise<ApiResponse<CertificateRecord>> {
    const data = await this.certificates.revoke(
      actorOf(session),
      id,
      dto.reason,
    );
    return { data };
  }

  /**
   * The signed document. Only an issued certificate prints here; a draft has
   * no number to print and is served by the preview route instead.
   */
  @Get(':id/pdf')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  async downloadPdf(
    @Param('id', UuidPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.documents.renderIssued(id);
    return this.stream(buffer, filename);
  }

  /** The draft as it will look once signed, watermarked and without a number. */
  @Get(':id/preview')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  async previewPdf(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.certificates.preview(
      actorOf(session),
      id,
    );
    return this.stream(buffer, filename);
  }

  @Post(':id/photo')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 1024 * 1024 } }),
  )
  async uploadPhoto(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponse<CertificateRecord>> {
    const data = await this.certificates.uploadPhoto(
      actorOf(session),
      id,
      file,
    );
    return { data };
  }

  /**
   * The validation QR, so the issued card can show what the paper prints.
   */
  @Get(':id/qr')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  async streamQr(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
  ): Promise<StreamableFile> {
    const buffer = await this.certificates.getVerifyQr(actorOf(session), id);
    return new StreamableFile(buffer, {
      type: 'image/png',
      length: buffer.length,
    });
  }

  /**
   * The 3x4 photo, streamed to its owner. It is personal data, so it stays
   * behind auth instead of being mounted from `uploads/certificates`.
   */
  @Get(':id/photo')
  @Roles(['PSYCHOLOGIST', 'ADMIN'])
  async streamPhoto(
    @Session() session: UserSession,
    @Param('id', UuidPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.certificates.getPhotoPath(actorOf(session), id);
    // Callback: the file passed the jail check but can vanish before send
    // (TOCTOU). Without this, @Res() bypasses the exception filter and the
    // request hangs instead of returning the shaped 404.
    res.sendFile(filePath, (err: unknown) => {
      if (err && !res.headersSent) {
        const body: ErrorResponse = {
          statusCode: 404,
          message: 'photo_not_found',
          error: 'NotFoundException',
        };
        res.status(404).json(body);
      }
    });
  }

  /** Inline so the browser opens the PDF instead of saving it silently. */
  private stream(buffer: Buffer, filename: string): StreamableFile {
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}"`,
      length: buffer.length,
    });
  }
}
