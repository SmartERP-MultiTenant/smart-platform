import { test as base } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

import { adminUser } from './helper';

// P5.2: seeds the deterministic test-only platform admin AFTER the e2e
// database reset (globalSetup) so the admin-access spec always has a known
// account. Runs in the `setup` project, independent from account.setup.ts
// (which creates the regular member fixture via the signup flow).
const setup = base.extend({});

setup('Seed platform admin', async () => {
  const prisma = new PrismaClient();

  try {
    await prisma.user.upsert({
      where: { email: adminUser.email },
      update: { platformRole: 'PLATFORM_ADMIN' },
      create: {
        email: adminUser.email,
        name: adminUser.name,
        password: await hash(adminUser.password, 12),
        emailVerified: new Date(),
        platformRole: 'PLATFORM_ADMIN',
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});
