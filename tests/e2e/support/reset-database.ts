import { PrismaClient } from '@prisma/client';

// Wipes EVERY table in the public schema (Prisma models AND Jackson's
// jackson_store/jackson_index/jackson_ttl), except the migration history.
// Used before each e2e run (globalSetup) and after (teardown) so no state
// survives — even from a run that was killed mid-way.
const TRUNCATE_ALL_SQL = `
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;
`;

export async function resetDatabase() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(TRUNCATE_ALL_SQL);
  } finally {
    await prisma.$disconnect();
  }
}
