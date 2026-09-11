import 'dotenv/config';
import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  app.use(express.json());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  // NOTE: no `trust proxy` is set on purpose. Rate limiting keys off
  // @Ip() (socket address). If this app ever goes behind nginx/LB, set
  // trust proxy then — otherwise all clients share one IP in the limiter.
  // Do NOT read X-Forwarded-For manually: it is client-spoofable.
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
