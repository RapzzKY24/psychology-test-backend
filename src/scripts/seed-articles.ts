import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ARTICLE_SEEDS } from './content/articles';

/**
 * Publishes the starter articles. Idempotent: re-running updates the body and
 * keeps the original `publishedAt` so links and ordering stay stable.
 */
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const article of ARTICLE_SEEDS) {
      const content = article.blocks as Prisma.InputJsonValue;
      const existing = await prisma.article.findUnique({
        where: { slug: article.slug },
        select: { id: true },
      });

      if (existing) {
        await prisma.article.update({
          where: { id: existing.id },
          data: {
            title: article.title,
            excerpt: article.excerpt,
            category: article.category,
            content,
            status: 'PUBLISHED',
          },
        });
        console.log(`updated  ${article.slug}`);
        continue;
      }

      await prisma.article.create({
        data: {
          slug: article.slug,
          title: article.title,
          excerpt: article.excerpt,
          category: article.category,
          content,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });
      console.log(`created  ${article.slug}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
