import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';

async function main() {
  const email = process.env.INSTANSI_EMAIL;
  const password = process.env.INSTANSI_PASSWORD;
  const name = process.env.INSTANSI_NAME || 'PT Contoh Instansi';

  if (!email || !password) {
    console.error('INSTANSI_EMAIL and INSTANSI_PASSWORD must be set in .env');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const hashedPassword = await hashPassword(password);

  // Upsert user
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: 'INSTANSI' },
    create: {
      id: `instansi-${Date.now()}`,
      name,
      email,
      emailVerified: true,
      role: 'INSTANSI',
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

  console.log(`Seeded instansi user: ${email} (role: INSTANSI)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
