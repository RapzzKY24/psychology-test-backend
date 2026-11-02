/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
jest.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

import puppeteer from 'puppeteer';
import { ReportPdfService } from '../pdf/report-pdf.service';

const launch = puppeteer.launch as unknown as jest.Mock;

interface FakePage {
  setContent: jest.Mock;
  pdf: jest.Mock;
  close: jest.Mock;
}

function fakeBrowser(): {
  browser: {
    newPage: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
  };
  page: FakePage;
} {
  const page: FakePage = {
    setContent: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newPage: jest.fn().mockResolvedValue(page),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };
  return { browser, page };
}

describe('ReportPdfService', () => {
  let service: ReportPdfService;

  beforeEach(() => {
    launch.mockReset();
    service = new ReportPdfService();
  });

  it('returns the PDF bytes as a Buffer', async () => {
    const { browser } = fakeBrowser();
    launch.mockResolvedValue(browser);

    const result = await service.render('<html></html>');

    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([1, 2, 3]);
  });

  it('prints A4 with backgrounds and no browser margins', async () => {
    const { browser, page } = fakeBrowser();
    launch.mockResolvedValue(browser);

    await service.render('<html></html>');

    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      }),
    );
  });

  it('loads the HTML before printing', async () => {
    const { browser, page } = fakeBrowser();
    launch.mockResolvedValue(browser);

    await service.render('<html><body>x</body></html>');

    expect(page.setContent).toHaveBeenCalledWith(
      '<html><body>x</body></html>',
      {
        waitUntil: 'load',
      },
    );
  });

  it('closes the page after a successful render', async () => {
    const { browser, page } = fakeBrowser();
    launch.mockResolvedValue(browser);

    await service.render('<html></html>');

    expect(page.close).toHaveBeenCalled();
  });

  it('closes the page and rethrows when printing fails', async () => {
    const { browser, page } = fakeBrowser();
    page.pdf.mockRejectedValue(new Error('print failed'));
    launch.mockResolvedValue(browser);

    await expect(service.render('<html></html>')).rejects.toThrow(
      'print failed',
    );
    expect(page.close).toHaveBeenCalled();
  });

  it('reuses one browser for several renders', async () => {
    const { browser } = fakeBrowser();
    launch.mockResolvedValue(browser);

    await service.render('<html>1</html>');
    await service.render('<html>2</html>');

    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('serialises concurrent renders', async () => {
    const { browser, page } = fakeBrowser();
    launch.mockResolvedValue(browser);

    let active = 0;
    let peak = 0;
    page.pdf.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Uint8Array([1]);
    });

    await Promise.all([
      service.render('<html>1</html>'),
      service.render('<html>2</html>'),
      service.render('<html>3</html>'),
    ]);

    expect(peak).toBe(1);
    expect(page.pdf).toHaveBeenCalledTimes(3);
  });

  it('relaunches after the browser disconnects', async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    launch
      .mockResolvedValueOnce(first.browser)
      .mockResolvedValueOnce(second.browser);

    await service.render('<html>1</html>');

    const disconnect = first.browser.on.mock.calls.find(
      ([event]) => event === 'disconnected',
    )?.[1] as () => void;
    disconnect();

    await service.render('<html>2</html>');

    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('closes the browser when the module is destroyed', async () => {
    const { browser } = fakeBrowser();
    launch.mockResolvedValue(browser);

    await service.render('<html></html>');
    await service.onModuleDestroy();

    expect(browser.close).toHaveBeenCalled();
  });

  it('does nothing on destroy when no browser was ever launched', async () => {
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(launch).not.toHaveBeenCalled();
  });
});
