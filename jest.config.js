// jest.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // if using TypeScript with a baseUrl set to the root directory then you need the below for alias' to work
  moduleDirectories: ['node_modules', '<rootDir>/'],
  // Resolve the '@/' path alias (tsconfig paths) used across lib/components.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['<rootDir>/tests/e2e'],
  collectCoverageFrom: ['lib/erp.ts', 'lib/rateLimit.ts', 'lib/zod/erp.ts'],
  coverageThreshold: {
    './lib/erp.ts': {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    './lib/rateLimit.ts': {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    './lib/zod/erp.ts': {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
