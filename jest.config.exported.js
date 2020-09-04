const config = require( './jest.config.js' );
module.exports = {
  ...config,
  testMatch: ['<rootDir>/test-exported/**/*.ts'],
  modulePathIgnorePatterns: ['/lib/', '/test-client/', '/integration/'],
};
