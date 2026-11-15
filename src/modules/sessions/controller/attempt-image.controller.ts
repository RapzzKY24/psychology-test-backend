import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import { AllowAnonymous, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { AttemptImagesService } from '../service/attempt-images.service';

/**
 * The drawing of one item. Anonymous at the guard level because the caller may
 * be a guest holding a participant token; the service decides who may read it.
 * A psychologist's browser sends the session cookie, so `<img src>` works there
 * without an extra fetch.
 */
@Controller('api/v1/public/attempts')
export class AttemptImageController {
  constructor(private readonly images: AttemptImagesService) {}

  @Get(':id/items/:itemId/image')
  @AllowAnonymous()
  async read(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Session() session: UserSession | null,
    @Headers('x-participant-token') participantToken: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.images.pathFor(id, itemId, {
      userId: session?.user?.id,
      role: session?.user?.role,
      participantToken,
    });
    res.sendFile(file);
  }
}
