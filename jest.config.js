/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          target: 'ES2022',
          lib: ['ES2022', 'DOM'],
          types: ['jest', 'node'],
        },
      },
    ],
  },
  testMatch: ['**/*.test.ts'],
  verbose: true,
  testTimeout: 30000,
  // Setup file for Web Crypto API polyfill
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
