import { Module } from '@nestjs/common';
import { ArticlesController } from './controller/articles.controller';
import { PublicArticlesController } from './controller/public-articles.controller';
import { ArticlesService } from './service/articles.service';
import { PrismaArticlesRepository } from './repository/articles.prisma-repository';
import { ARTICLES_REPOSITORY } from './repository/articles.repository';

@Module({
  controllers: [ArticlesController, PublicArticlesController],
  providers: [
    ArticlesService,
    { provide: ARTICLES_REPOSITORY, useClass: PrismaArticlesRepository },
  ],
  exports: [ArticlesService, ARTICLES_REPOSITORY],
})
export class ArticlesModule {}
