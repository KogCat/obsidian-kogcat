/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/test/setup-i18n.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    // esModuleInterop on so `import path from 'path'` (the form esbuild
    // bundles in production) also works under ts-jest's CommonJS output.
    // Production tsconfig intentionally omits the flag because esbuild
    // handles both styles.
    '^.+.tsx?$': ['ts-jest', { tsconfig: { esModuleInterop: true } }],
  },
}
