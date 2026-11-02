import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DEFAULT_INSTITUTION_CODE,
  DEFAULT_INSTITUTION_NAME,
  REPORT_SETTING_KEYS,
} from '../modules/reports/report-settings';

/**
 * Seeds the two Setting keys the report header reads. Existing rows are left
 * untouched (`update: {}`), so running this after an admin has renamed the
 * institution does not undo their change.
 */
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const rows = [
    {
      key: REPORT_SETTING_KEYS.institutionName,
      value: DEFAULT_INSTITUTION_NAME,
    },
    {
      key: REPORT_SETTING_KEYS.institutionCode,
      value: DEFAULT_INSTITUTION_CODE,
    },
  ];

  for (const row of rows) {
    await prisma.setting.upsert({
      where: { key: row.key },
      update: {},
      create: { key: row.key, value: row.value },
    });
    const stored = await prisma.setting.findUnique({ where: { key: row.key } });
    console.log(`${row.key} = ${JSON.stringify(stored?.value)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
