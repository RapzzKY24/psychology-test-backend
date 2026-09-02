import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './modules/auth/auth';
import { AdminController } from './modules/admin/admin.controller';
import { PsychologistController } from './modules/psychologist/psychologist.controller';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule.forRoot({ auth })],
  controllers: [AppController, AdminController, PsychologistController],
  providers: [AppService],
})
export class AppModule {}
