import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './modules/auth/auth';
import { AdminModule } from './modules/admin/admin.module';
import { PsychologistModule } from './modules/psychologist/psychologist.module';
import { TestsModule } from './modules/tests/tests.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { InstansiModule } from './modules/instansi/instansi.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ResultsModule } from './modules/results/results.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { EventLogModule } from './modules/event-log/event-log.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    PrismaModule,
    HealthModule,
    AuthModule.forRoot({ auth }),
    AdminModule,
    PsychologistModule,
    TestsModule,
    ArticlesModule,
    ReviewsModule,
    InstitutionsModule,
    InstansiModule,
    SessionsModule,
    ResultsModule,
    OrdersModule,
    InvoicesModule,
    IdempotencyModule,
    EventLogModule,
    PaymentsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
