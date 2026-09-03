import { Module } from '@nestjs/common';
import { ReviewsController } from './controller/reviews.controller';
import { AdminResultsController } from './controller/admin-results.controller';
import { VerifyController } from './controller/verify.controller';
import { ReviewsService } from './service/reviews.service';
import { PrismaReviewsRepository } from './repository/reviews.prisma-repository';
import { REVIEWS_REPOSITORY } from './repository/reviews.repository';

@Module({
  controllers: [ReviewsController, AdminResultsController, VerifyController],
  providers: [
    ReviewsService,
    { provide: REVIEWS_REPOSITORY, useClass: PrismaReviewsRepository },
  ],
})
export class ReviewsModule {}
