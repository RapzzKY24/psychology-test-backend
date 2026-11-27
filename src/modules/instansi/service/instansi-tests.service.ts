import { Inject, Injectable } from '@nestjs/common';
import { TestsService } from '../../tests/service/tests.service';
import { INSTITUTIONS_REPOSITORY } from '../../institutions/repository/institutions.repository';
import type { InstitutionsRepository } from '../../institutions/repository/institutions.repository';
import { InstansiParticipantsService } from './instansi-participants.service';
import type { InstansiTestDto } from '../dto/instansi-test.dto';
import type { PaginatedResponse } from '../../../common/interfaces/api-response.interface';

/**
 * The institution catalog with its own deal prices applied. Public tests keep
 * their list price; a deal row overrides it for this institution only.
 */
@Injectable()
export class InstansiTestsService {
  constructor(
    private readonly testsService: TestsService,
    @Inject(INSTITUTIONS_REPOSITORY)
    private readonly institutionsRepo: InstitutionsRepository,
    private readonly participantsService: InstansiParticipantsService,
  ) {}

  async listForInstitution(
    userId: string,
  ): Promise<PaginatedResponse<InstansiTestDto>> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const base = await this.testsService.findAllPublic();
    const overrides = await this.institutionsRepo.findTestPricesForTests(
      institutionId,
      base.data.map((test) => test.id),
    );
    const dealByTest = new Map(overrides.map((row) => [row.testId, row.price]));

    return {
      ...base,
      data: base.data.map((test) => {
        const dealPrice = dealByTest.get(test.id);
        return {
          ...test,
          basePrice: test.price,
          price: dealPrice ?? test.price,
          hasDealPrice: dealPrice != null,
        };
      }),
    };
  }

  /** One published test with this institution's deal price applied. */
  async findBySlugForInstitution(
    userId: string,
    slug: string,
  ): Promise<InstansiTestDto> {
    const institutionId =
      await this.participantsService.resolveInstitutionId(userId);
    const test = await this.testsService.findBySlugPublic(slug);
    const overrides = await this.institutionsRepo.findTestPricesForTests(
      institutionId,
      [test.id],
    );
    const dealPrice = overrides[0]?.price ?? null;
    return {
      ...test,
      basePrice: test.price,
      price: dealPrice ?? test.price,
      hasDealPrice: dealPrice != null,
    };
  }
}
