export const user = {
  name: 'Jackson',
  email: 'jackson@example.com',
  password: 'password',
} as const;

export const team = {
  name: 'Example',
  slug: 'example',
} as const;

export const secondTeam = {
  name: 'SMART PLATFORM',
  slug: 'smart-platform',
} as const;

// P5.2: deterministic test-only platform admin. Seeded by support/admin.setup.ts
// after the e2e database reset — never created by signup flows.
export const adminUser = {
  name: 'Platform Admin',
  email: 'platform-admin@example.com',
  password: 'platform-admin-password',
} as const;
