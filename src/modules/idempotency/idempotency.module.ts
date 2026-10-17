import { Module } from '@nestjs/common';
import { IdempotencyService } from './service/idempotency.service';
import { PrismaIdempotencyRepository } from './repository/idempotency.prisma-repository';
import { IDEMPOTENCY_REPOSITORY } from './repository/idempotency.repository';

@Module({
  providers: [
    IdempotencyService,
    { provide: IDEMPOTENCY_REPOSITORY, useClass: PrismaIdempotencyRepository },
  ],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
