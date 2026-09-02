import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const hashedPassword = await hashPassword(password);

  // Upsert user
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: 'ADMIN' },
    create: {
      id: `admin-${Date.now()}`,
      name,
      email,
      emailVerified: true,
      role: 'ADMIN',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Upsert account for credential provider
  const existingAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: hashedPassword },
    });
  } else {
    await prisma.account.create({
      data: {
        id: `account-${Date.now()}`,
        accountId: user.id,
        providerId: 'credential',
        issuer: 'local:credential',
        userId: user.id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  console.log(`Seeded admin: ${email} (role: ADMIN)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
