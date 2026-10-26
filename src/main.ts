import 'dotenv/config';
import * as express from 'express';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
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
  // NOTE: no `trust proxy` is set on purpose. Rate limiting keys off
  // @Ip() (socket address). If this app ever goes behind nginx/LB, set
  // trust proxy then — otherwise all clients share one IP in the limiter.
  // Do NOT read X-Forwarded-For manually: it is client-spoofable.
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
