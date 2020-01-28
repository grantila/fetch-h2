module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.ts'],
  modulePathIgnorePatterns: ['/lib/', '/test-client/'],
  collectCoverageFrom: ['<rootDir>/lib/**', 'index.ts'],
  coverageReporters: ['lcov', 'text', 'html'],
};
