import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { TESTS_REPOSITORY } from '../repository/tests.repository';
import type { TestsRepository } from '../repository/tests.repository';
import { getItemSchema } from '../../../scorers/schemas';
import { DISC_PATTERN_CATALOG } from '../../../scorers/schemas/forced-choice-disc';
import type { Test } from '../../../generated/prisma/client';

@Injectable()
export class TestsPublishService {
  constructor(
    @Inject(TESTS_REPOSITORY)
    private readonly repo: TestsRepository,
  ) {}

  async publish(testId: string): Promise<Test> {
    const test = await this.repo.findById(testId);
    if (!test) throw new NotFoundException('Test not found');

    if (test.status === 'ARCHIVED') {
      throw new ConflictException('cannot publish ARCHIVED test');
    }

    const items = await this.repo.findItemsByTestId(testId);
    if (items.length === 0) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: ['test must have at least 1 item'],
      });
    }

    const schema = getItemSchema(test.scorerType);
    if (schema) {
      for (let i = 0; i < items.length; i++) {
        const result = schema.safeParse(items[i].content);
        if (!result.success) {
          throw new UnprocessableEntityException({
            message: 'validation_failed',
            details: [
              `items[${i}]: ${result.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`).join(', ')}`,
            ],
          });
        }
      }
    }

    const interpretations = await this.repo.findInterpretationsByTestId(testId);
    const existingCodes = new Set(
      interpretations.map((interp) => interp.patternCode),
    );
    const missing = DISC_PATTERN_CATALOG.filter(
      (code) => !existingCodes.has(code),
    );
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        message: 'validation_failed',
        details: [`missing pattern codes: ${missing.join(', ')}`],
      });
    }

    return this.repo.update(testId, { status: 'PUBLISHED' });
  }

  async archive(testId: string): Promise<Test> {
    const test = await this.repo.findById(testId);
    if (!test) throw new NotFoundException('Test not found');
    if (test.status !== 'PUBLISHED') {
      throw new ConflictException('only PUBLISHED test can be archived');
    }
    return this.repo.update(testId, { status: 'ARCHIVED' });
  }
}
