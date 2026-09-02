import { Module } from '@nestjs/common';
import { TestsController } from './controller/tests.controller';
import { TestsService } from './service/tests.service';
import { PrismaTestsRepository } from './repository/tests.prisma-repository';
import { TESTS_REPOSITORY } from './repository/tests.repository';

@Module({
  controllers: [TestsController],
  providers: [
    TestsService,
    { provide: TESTS_REPOSITORY, useClass: PrismaTestsRepository },
  ],
})
export class TestsModule {}
