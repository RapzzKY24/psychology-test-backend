import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ME_PROFILE_REPOSITORY,
  type MeProfileData,
  type MeProfileRepository,
} from '../repository/me-profile.repository';
import type { UpdateMeProfileDto } from '../dto/me-profile.dto';

@Injectable()
export class MeProfileService {
  constructor(
    @Inject(ME_PROFILE_REPOSITORY)
    private readonly repo: MeProfileRepository,
  ) {}

  async get(userId: string): Promise<MeProfileData> {
    const profile = await this.repo.find(userId);
    if (!profile) throw new NotFoundException('profile_not_found');
    return profile;
  }

  /** Partial update: an omitted key keeps what is stored. */
  async update(
    userId: string,
    dto: UpdateMeProfileDto,
  ): Promise<MeProfileData> {
    const phone =
      dto.phone === undefined
        ? undefined
        : dto.phone === null || dto.phone === ''
          ? null
          : dto.phone;

    if (dto.name !== undefined || phone !== undefined) {
      const updated = await this.repo.update(userId, { name: dto.name, phone });
      if (!updated) throw new NotFoundException('profile_not_found');
    }

    return this.get(userId);
  }
}
