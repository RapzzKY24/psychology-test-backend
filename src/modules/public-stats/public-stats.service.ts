import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PsychologistService } from '../psychologist/service/psychologist.service';

/**
 * Numbers the landing page can print without inventing anything. They are
 * counts of what is live right now, so they shrink when a test is unpublished
 * — which is the point: a proof band that only ever grows is decoration.
 */
export interface PublicStats {
  tests: number;
  categories: number;
  psychologists: number;
}

@Injectable()
export class PublicStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly psychologists: PsychologistService,
  ) {}

  async getStats(): Promise<PublicStats> {
    const [tests, categoryRows, psychologists] = await Promise.all([
      this.prisma.test.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.test.findMany({
        where: { status: 'PUBLISHED' },
        select: { category: true },
        distinct: ['category'],
      }),
      // Same source as the credential block, so the count always matches the
      // names a visitor can actually read on a test page.
      this.psychologists.listPublic(),
    ]);

    return {
      tests,
      categories: categoryRows.length,
      psychologists: psychologists.length,
    };
  }
}
