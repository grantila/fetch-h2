module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/fetch-h2/**/*.ts'],
  collectCoverageFrom: ['<rootDir>/lib/**', 'index.ts'],
  coverageReporters: ['lcov', 'text', 'html'],
};
