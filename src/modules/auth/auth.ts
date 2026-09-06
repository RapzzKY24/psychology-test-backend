import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
  basePath: '/api/v1/auth',
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  trustedOrigins: ['http://localhost:4000', 'http://localhost:3000'],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
    },
    storage: 'memory',
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin({
      defaultRole: 'PARTICIPANT',
    }),
  ],
  user: {
    additionalFields: {
      role: {
        type: ['PARTICIPANT', 'ADMIN', 'PSYCHOLOGIST', 'INSTANSI'],
        required: false,
        defaultValue: 'PARTICIPANT',
        input: false,
      },
    },
  },
});
