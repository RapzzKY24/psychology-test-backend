import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';

/**
 * Turns report HTML into a PDF.
 *
 * One Chromium instance is shared for the whole process (launching it costs
 * ~300 ms and a lot of memory) and renders are serialised through a promise
 * chain: two PDFs at once would spike RAM on a small VPS for no benefit, since
 * a report is a few hundred milliseconds of work.
 */
@Injectable()
export class ReportPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(ReportPdfService.name);
  private browserPromise: Promise<Browser> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  async render(html: string): Promise<Buffer> {
    return this.withLock(async () => {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'load' });
        const bytes = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });
        return Buffer.from(bytes);
      } finally {
        await page.close().catch(() => undefined);
      }
    });
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer
        .launch({
          headless: true,
          // --no-sandbox is required inside containers without user namespaces;
          // --disable-dev-shm-usage avoids crashes on the small /dev/shm that
          // Docker gives by default.
          args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        })
        .then((browser) => {
          browser.on('disconnected', () => {
            this.logger.warn('chromium disconnected; will relaunch on demand');
            this.browserPromise = null;
          });
          return browser;
        })
        .catch((error: unknown) => {
          this.browserPromise = null;
          throw error;
        });
    }
    return this.browserPromise;
  }

  /** Runs one render at a time, in arrival order. */
  private withLock<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async onModuleDestroy(): Promise<void> {
    const pending = this.browserPromise;
    this.browserPromise = null;
    if (!pending) return;
    const browser = await pending.catch(() => null);
    await browser?.close().catch(() => undefined);
  }
}
