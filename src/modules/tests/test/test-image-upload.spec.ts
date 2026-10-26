import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Express } from 'express';
import { TestsService } from '../service/tests.service';
import type { TestsRepository } from '../repository/tests.repository';

function upload(
  originalname = 'cover.png',
  mimetype = 'image/png',
): Express.Multer.File {
  return {
    originalname,
    mimetype,
    buffer: Buffer.from('image-bytes'),
    size: 11,
  } as Express.Multer.File;
}

describe('TestsService image uploads', () => {
  let root: string;
  let repo: jest.Mocked<TestsRepository>;
  let service: TestsService;

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'test-image-'));
    repo = {
      findById: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<TestsRepository>;
    service = new TestsService(repo, {
      get: () => root,
    } as unknown as ConstructorParameters<typeof TestsService>[1]);
  });

  afterEach(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('writes the cover, points the test at it and returns the update', async () => {
    repo.findById.mockResolvedValue({ id: 't1', imageUrl: null } as never);
    repo.update.mockImplementation(((
      _id: string,
      data: { imageUrl: string },
    ) => ({
      id: 't1',
      imageUrl: data.imageUrl,
    })) as never);

    const updated = await service.saveCoverImage('t1', upload());
    const imageUrl = updated.imageUrl;
    if (!imageUrl) throw new Error('cover url missing');

    expect(imageUrl).toMatch(/^\/uploads\/test-covers\/[a-f0-9-]+\.png$/);
    const written = path.join(root, 'test-covers', path.basename(imageUrl));
    expect(fs.existsSync(written)).toBe(true);
  });

  it('deletes the cover it replaced', async () => {
    const dir = path.join(root, 'test-covers');
    await fs.promises.mkdir(dir, { recursive: true });
    const previous = path.join(dir, 'previous.png');
    await fs.promises.writeFile(previous, 'old');

    repo.findById.mockResolvedValue({
      id: 't1',
      imageUrl: '/uploads/test-covers/previous.png',
    } as never);
    repo.update.mockResolvedValue({ id: 't1' } as never);

    await service.saveCoverImage('t1', upload());

    expect(fs.existsSync(previous)).toBe(false);
  });

  it('never touches a file outside the cover dir', async () => {
    const other = path.join(root, 'qris', 'proof.png');
    await fs.promises.mkdir(path.dirname(other), { recursive: true });
    await fs.promises.writeFile(other, 'proof');

    repo.findById.mockResolvedValue({
      id: 't1',
      imageUrl: '/uploads/qris/proof.png',
    } as never);
    repo.update.mockResolvedValue({ id: 't1' } as never);

    await service.saveCoverImage('t1', upload());

    expect(fs.existsSync(other)).toBe(true);
  });

  it('404s when the test does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.saveCoverImage('missing', upload())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('stores an item figure under test-items', async () => {
    repo.findById.mockResolvedValue({ id: 't1' } as never);

    const { imageUrl } = await service.saveItemImage(
      't1',
      upload('figure.jpg', 'image/jpeg'),
    );

    expect(imageUrl).toMatch(/^\/uploads\/test-items\/[a-f0-9-]+\.jpg$/);
    expect(
      fs.existsSync(path.join(root, 'test-items', path.basename(imageUrl))),
    ).toBe(true);
  });
});
