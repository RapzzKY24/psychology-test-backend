import { Module } from '@nestjs/common';
import { SessionsController } from './controller/sessions.controller';
import { SessionsPublicController } from './controller/sessions-public.controller';
import { AttemptsPublicController } from './controller/attempts.controller';
import { SessionsService } from './service/sessions.service';
import { AttemptsService } from './service/attempts.service';
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
  ],
  providers: [
    SessionsService,
    AttemptsService,
    ParticipantTokenGuard,
    { provide: SESSIONS_REPOSITORY, useClass: PrismaSessionsRepository },
    { provide: ATTEMPTS_REPOSITORY, useClass: PrismaAttemptsRepository },
  ],
})
export class SessionsModule {}
