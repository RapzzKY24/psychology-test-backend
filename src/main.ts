import 'dotenv/config';
import * as express from 'express';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use(express.json());

  // Catalog media is public: item figures and test covers. Payment proofs
  // (qris) and psychologist signatures stay behind their authenticated routes,
  // so they are deliberately not mounted here.
  const uploadDir = path.resolve(
    app.get(ConfigService).get<string>('app.uploadDir', './uploads'),
  );
  for (const dir of ['test-items', 'test-covers']) {
    app.use(
      `/uploads/${dir}`,
      express.static(path.join(uploadDir, dir), { index: false, maxAge: '7d' }),
    );
  }

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  // Production sits behind exactly one hop (nginx), which appends the client
  // address to X-Forwarded-For. Without this, `@Ip()` returns the socket
  // address (127.0.0.1) and every client shares a single rate-limit bucket.
  // Trusting one hop is what keeps spoofing out: proxy-addr reads the entry
  // nginx appended last, not the one a client may have sent. Development stays
  // untrusted so a direct connection cannot fake its own address.
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
