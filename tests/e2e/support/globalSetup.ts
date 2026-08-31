// Provisions and wipes the e2e database so every run starts from a known-clean
// state — even if the previous run was killed mid-way (its teardown never ran).
// The e2e env (.env.e2e) is loaded by playwright.config.ts into the runner
// process, so DATABASE_URL and friends are already correct here.
import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

import { resetDatabase } from './reset-database';

async function ensureDatabaseExists() {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  const maintenanceUrl = new URL(url.toString());
  maintenanceUrl.pathname = '/postgres';

  const prisma = new PrismaClient({
    datasources: { db: { url: maintenanceUrl.toString() } },
  });
  try {
    const existing = await prisma.$queryRawUnsafe(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      dbName
    );
    if (!existing || (existing as any[]).length === 0) {
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function globalSetup() {
  // (a) Make sure the e2e database exists.
  await ensureDatabaseExists();

  // (b) Push the Prisma schema (creates all tables, incl. jackson_*).
  execSync(
    path.join(process.cwd(), 'node_modules/.bin/prisma') +
      ' db push --skip-generate',
    { env: process.env, stdio: 'inherit' }
  );

  // (c) Start from a fully clean database.
  await resetDatabase();
}

export default globalSetup;
