import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'fs';
import path from 'path';
import { ATTEMPTS_REPOSITORY } from '../repository/attempts.repository';
import type { AttemptsRepository } from '../repository/attempts.repository';
import { SESSIONS_REPOSITORY } from '../repository/sessions.repository';
import type { SessionsRepository } from '../repository/sessions.repository';
import { attemptImageFile } from '../utils/attempt-image-path';
import { hashParticipantToken } from '../utils/hash-participant-token';

/** Who is asking for a drawing: an admin, the signed-in owner, or a guest. */
export interface ImageReader {
  userId?: string | null;
  /** better-auth types this loosely; it may arrive as an array. */
  role?: string | string[] | null;
  participantToken?: string | null;
}

/**
 * Reads back a participant's drawing.
 *
 * Drawings are not catalog media: a Wartegg box is clinical material, so the
 * files are never mounted as static assets. Every read is authorised against
 * the attempt, and every refusal is a 404 — the same answer a missing attempt
 * gives, so an id cannot be probed for existence.
 */
@Injectable()
export class AttemptImagesService {
  constructor(
    @Inject(ATTEMPTS_REPOSITORY)
    private readonly repo: AttemptsRepository,
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessions: SessionsRepository,
    private readonly config: ConfigService,
  ) {}

  async pathFor(
    attemptId: string,
    itemId: string,
    reader: ImageReader,
  ): Promise<string> {
    const detail = await this.repo.findAccessDetail(attemptId);
    if (!detail) throw new NotFoundException('Image not found');
    if (!(await this.mayRead(detail, reader))) {
      throw new NotFoundException('Image not found');
    }
    // An item id from another test would otherwise resolve to a path that
    // simply does not exist; reject it here so the two cases stay distinct in
    // the code even though both answer 404.
    if (!detail.items.some((item) => item.id === itemId)) {
      throw new NotFoundException('Image not found');
    }

    const root = this.config.get<string>('app.uploadDir', './uploads');
    const file = path.resolve(attemptImageFile(root, attemptId, itemId));
    if (!fs.existsSync(file)) throw new NotFoundException('Image not found');
    return file;
  }

  private async mayRead(
    detail: {
      attempt: { participantId: string | null; userId: string | null };
    },
    reader: ImageReader,
  ): Promise<boolean> {
    const role = reader.role;
    const isAdmin = Array.isArray(role)
      ? role.includes('ADMIN')
      : role === 'ADMIN';
    if (isAdmin) return true;

    if (reader.userId && detail.attempt.userId === reader.userId) return true;

    if (reader.participantToken) {
      const participant = await this.sessions.findParticipantByTokenHash(
        hashParticipantToken(reader.participantToken),
      );
      return Boolean(
        participant && detail.attempt.participantId === participant.id,
      );
    }
    return false;
  }
}
