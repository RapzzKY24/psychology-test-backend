import { Module } from '@nestjs/common';
import { SessionsController } from './controller/sessions.controller';
import { SessionsPublicController } from './controller/sessions-public.controller';
import { AttemptsPublicController } from './controller/attempts.controller';
import { MeAttemptsController } from './controller/me-attempts.controller';
import { AttemptImageController } from './controller/attempt-image.controller';
import { SessionsService } from './service/sessions.service';
import { AttemptsService } from './service/attempts.service';
import { SessionsPublicService } from './service/sessions-public.service';
import { MeAttemptsService } from './service/me-attempts.service';
import { AttemptImagesService } from './service/attempt-images.service';
import { PrismaSessionsRepository } from './repository/sessions.prisma-repository';
import { PrismaAttemptsRepository } from './repository/attempts.prisma-repository';
import { ParticipantTokenGuard } from './guards/participant-token.guard';
import { SESSIONS_REPOSITORY } from './repository/sessions.repository';
import { ATTEMPTS_REPOSITORY } from './repository/attempts.repository';

@Module({
  controllers: [
    SessionsController,
    SessionsPublicController,
    AttemptsPublicController,
    MeAttemptsController,
    AttemptImageController,
  ],
  providers: [
    SessionsService,
    AttemptsService,
    SessionsPublicService,
    MeAttemptsService,
    AttemptImagesService,
    ParticipantTokenGuard,
    { provide: SESSIONS_REPOSITORY, useClass: PrismaSessionsRepository },
    { provide: ATTEMPTS_REPOSITORY, useClass: PrismaAttemptsRepository },
  ],
  exports: [
    SESSIONS_REPOSITORY,
    ATTEMPTS_REPOSITORY,
    ParticipantTokenGuard,
    SessionsService,
  ],
})
export class SessionsModule {}
