import { Module } from '@nestjs/common';
import { TestsController } from './controller/tests.controller';
import { PublicTestsController } from './controller/public-tests.controller';
import { TestsService } from './service/tests.service';
import { TestsPublishService } from './service/tests-publish.service';
import { PrismaTestsRepository } from './repository/tests.prisma-repository';
import { TESTS_REPOSITORY } from './repository/tests.repository';

@Module({
  controllers: [TestsController, PublicTestsController],
  providers: [
    TestsService,
    TestsPublishService,
    { provide: TESTS_REPOSITORY, useClass: PrismaTestsRepository },
  ],
  exports: [TestsService],
})
export class TestsModule {}
