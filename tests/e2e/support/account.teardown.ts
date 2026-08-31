import { test as teardown } from '@playwright/test';
import { resetDatabase } from './reset-database';

teardown('delete database', async () => {
  // Wipes every public table (Prisma models + Jackson's jackson_* tables),
  // so the next run starts clean even if this run was interrupted.
  await resetDatabase();
});
