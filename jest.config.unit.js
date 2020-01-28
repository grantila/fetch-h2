const config = require( './jest.config.js' );
module.exports = {
  ...config,
  modulePathIgnorePatterns: [
    ...config.modulePathIgnorePatterns,
    '/integration/'
  ],
};
