import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ConfigService } from '@nestjs/config';
import {
  ATTEMPT_IMAGE_SUBDIR,
  attemptImageDir,
  attemptImageFile,
} from '../utils/attempt-image-path';
import { validateAttemptImage } from '../utils/validate-attempt-image';
import { AttemptImagesService } from '../service/attempt-images.service';
import type { AttemptsRepository } from '../repository/attempts.repository';
import type { SessionsRepository } from '../repository/sessions.repository';

const ATTEMPT = 'att-1';
const ITEM = 'it-1';

function makeFile(overrides: Partial<Express.Multer.File> = {}) {
  return {
    mimetype: 'image/png',
    size: 128,
    buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
    ...overrides,
  } as Express.Multer.File;
}

describe('attempt image paths', () => {
  it('puts every drawing under its own attempt directory', () => {
    expect(attemptImageDir('/srv/uploads', ATTEMPT)).toBe(
      path.join('/srv/uploads', ATTEMPT_IMAGE_SUBDIR, ATTEMPT),
    );
    expect(attemptImageFile('/srv/uploads', ATTEMPT, ITEM)).toBe(
      path.join('/srv/uploads', ATTEMPT_IMAGE_SUBDIR, ATTEMPT, `${ITEM}.png`),
    );
  });
});

describe('validateAttemptImage', () => {
  it('accepts a png', () => {
    expect(() => validateAttemptImage(makeFile())).not.toThrow();
  });

  it('rejects a missing file, a jpeg, an empty file and an oversized one', () => {
    expect(() =>
      validateAttemptImage(undefined as unknown as Express.Multer.File),
    ).toThrow('file is required');
    expect(() =>
      validateAttemptImage(makeFile({ mimetype: 'image/jpeg' })),
    ).toThrow('unsupported_media_type');
    expect(() => validateAttemptImage(makeFile({ size: 0 }))).toThrow(
      'file is empty',
    );
    expect(() =>
      validateAttemptImage(makeFile({ size: 3 * 1024 * 1024 })),
    ).toThrow('file_too_large');
  });
});

describe('AttemptImagesService', () => {
  let service: AttemptImagesService;
  let repo: jest.Mocked<AttemptsRepository>;
  let sessions: jest.Mocked<SessionsRepository>;
  let root: string;

  const detail = {
    attempt: { participantId: 'p-1', userId: null as string | null },
    items: [{ id: ITEM }],
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'attempt-images-'));
    repo = {
      findAccessDetail: jest.fn(),
    } as unknown as jest.Mocked<AttemptsRepository>;
    sessions = {
      findParticipantByTokenHash: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;
    service = new AttemptImagesService(repo, sessions, {
      get: () => root,
    } as unknown as ConfigService);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeDrawing(): string {
    const dir = attemptImageDir(root, ATTEMPT);
    fs.mkdirSync(dir, { recursive: true });
    const file = attemptImageFile(root, ATTEMPT, ITEM);
    fs.writeFileSync(file, 'png');
    return path.resolve(file);
  }

  it('serves the drawing to the guest who owns the attempt', async () => {
    const file = writeDrawing();
    repo.findAccessDetail.mockResolvedValue(detail as never);
    sessions.findParticipantByTokenHash.mockResolvedValue({
      id: 'p-1',
    } as never);

    await expect(
      service.pathFor(ATTEMPT, ITEM, { participantToken: 'tok' }),
    ).resolves.toBe(file);
  });

  it('serves the drawing to the signed-in owner', async () => {
    const file = writeDrawing();
    repo.findAccessDetail.mockResolvedValue({
      ...detail,
      attempt: { participantId: null, userId: 'u-1' },
    } as never);

    await expect(
      service.pathFor(ATTEMPT, ITEM, { userId: 'u-1' }),
    ).resolves.toBe(file);
  });

  it('serves the drawing to an admin, including the array form of the role', async () => {
    const file = writeDrawing();
    repo.findAccessDetail.mockResolvedValue(detail as never);

    await expect(
      service.pathFor(ATTEMPT, ITEM, { role: 'ADMIN' }),
    ).resolves.toBe(file);
    await expect(
      service.pathFor(ATTEMPT, ITEM, { role: ['ADMIN', 'PARTICIPANT'] }),
    ).resolves.toBe(file);
  });

  it('serves the drawing to a psychologist reading the review screen', async () => {
    const file = writeDrawing();
    repo.findAccessDetail.mockResolvedValue(detail as never);

    await expect(
      service.pathFor(ATTEMPT, ITEM, { role: 'PSYCHOLOGIST' }),
    ).resolves.toBe(file);
    await expect(
      service.pathFor(ATTEMPT, ITEM, { role: ['PSYCHOLOGIST'] }),
    ).resolves.toBe(file);
  });

  it('answers 404 to a stranger, never 403', async () => {
    writeDrawing();
    repo.findAccessDetail.mockResolvedValue(detail as never);
    sessions.findParticipantByTokenHash.mockResolvedValue({
      id: 'p-OTHER',
    } as never);

    await expect(
      service.pathFor(ATTEMPT, ITEM, { participantToken: 'tok' }),
    ).rejects.toThrow('Image not found');
    await expect(
      service.pathFor(ATTEMPT, ITEM, { userId: 'u-OTHER' }),
    ).rejects.toThrow('Image not found');
    await expect(service.pathFor(ATTEMPT, ITEM, {})).rejects.toThrow(
      'Image not found',
    );
  });

  it('answers 404 when the attempt or the drawing is missing', async () => {
    repo.findAccessDetail.mockResolvedValue(null);
    await expect(
      service.pathFor(ATTEMPT, ITEM, { role: 'ADMIN' }),
    ).rejects.toThrow('Image not found');

    repo.findAccessDetail.mockResolvedValue(detail as never);
    await expect(
      service.pathFor(ATTEMPT, ITEM, { role: 'ADMIN' }),
    ).rejects.toThrow('Image not found');
  });

  it('answers 404 for an item that belongs to another test', async () => {
    writeDrawing();
    repo.findAccessDetail.mockResolvedValue(detail as never);
    await expect(
      service.pathFor(ATTEMPT, 'it-OTHER', { role: 'ADMIN' }),
    ).rejects.toThrow('Image not found');
  });
});
