/**
 * P5.2 — Seed a platform admin (role bootstrap).
 *
 * Marks an EXISTING platform user as `PLATFORM_ADMIN`. It never creates a
 * user, never sets or prints a password, and never touches any API key
 * material (including ERP_PLATFORM_API_KEY).
 *
 * Usage:
 *   npm run seed:platform-admin -- --email=owner@example.com
 *   PLATFORM_ADMIN_EMAIL=owner@example.com npm run seed:platform-admin
 *
 * The email resolves in this order: `--email` argument → `PLATFORM_ADMIN_EMAIL`
 * (env or `.env`). Run against the database in DATABASE_URL — check it before
 * invoking (local: postgresql://...@localhost:5433/saas).
 */
import { PlatformRole, PrismaClient } from '@prisma/client';

// `.env` loading is EXPLICIT here: the npm script runs
// `node --env-file .env -r ts-node/register` (repo convention, same as
// `delete-team`). Prisma 6 does resolve `.env` on its own in most setups,
// but relying on that implicit behavior is fragile across versions and
// invocation styles — and the pre-flight guard below gives a clear error
// instead of an engine error when the variable is genuinely absent. If you
// run this file directly, export DATABASE_URL / PLATFORM_ADMIN_EMAIL yourself.
const resolveEmail = (): string | null => {
  const argv = process.argv.slice(2);

  // Support both `--email=x` and `--email x`.
  const flagIndex = argv.findIndex((arg) => arg === '--email');
  const flagValue =
    flagIndex !== -1
      ? argv[flagIndex + 1]
      : argv.find((arg) => arg.startsWith('--email='))?.split('=')[1];

  const email = (flagValue || process.env.PLATFORM_ADMIN_EMAIL || '').trim();

  return email || null;
};

const main = async () => {
  // Pre-flight BEFORE constructing the client, so a missing database URL
  // fails with a clear message instead of a Prisma engine error.
  if (!process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL is not set. Run via `npm run seed:platform-admin` (loads .env) or export it manually.'
    );
    process.exitCode = 1;
    return;
  }

  const email = resolveEmail();

  if (!email) {
    console.error(
      'No admin email provided. Pass --email=<address> or set PLATFORM_ADMIN_EMAIL.'
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  try {
    // Unique-index lookup first, then a case-insensitive fallback so
    // `Owner@Example.com` still resolves to `owner@example.com`.
    let user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, platformRole: true },
    });

    if (!user) {
      user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, email: true, platformRole: true },
      });
    }

    if (!user) {
      console.error(
        `User not found: ${email}. Create the account first (register or seed), then run this script.`
      );
      process.exitCode = 1;
      return;
    }

    if (user.platformRole === PlatformRole.PLATFORM_ADMIN) {
      console.log(`User ${user.email} is already a platform admin. No change.`);
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { platformRole: PlatformRole.PLATFORM_ADMIN },
      select: { id: true, email: true, platformRole: true },
    });

    console.log(
      `Platform admin granted: ${updated.email} (${updated.id}) → ${updated.platformRole}`
    );
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error('Failed to seed platform admin:', error);
  process.exitCode = 1;
});
