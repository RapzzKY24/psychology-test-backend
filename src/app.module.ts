import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './modules/auth/auth';
import { AdminModule } from './modules/admin/admin.module';
import { PsychologistModule } from './modules/psychologist/psychologist.module';
import { TestsModule } from './modules/tests/tests.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ResultsModule } from './modules/results/results.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InvoicesModule } from './modules/invoices/invoices.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule.forRoot({ auth }),
    AdminModule,
    PsychologistModule,
    TestsModule,
    ReviewsModule,
    InstitutionsModule,
    SessionsModule,
    ResultsModule,
    OrdersModule,
    InvoicesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
