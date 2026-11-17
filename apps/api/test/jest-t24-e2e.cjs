// T24 database acceptance runs only inside its dedicated isolation harness.
module.exports = {
  ...require('./jest-e2e.json'),
  testRegex:
    '(t24-kyc\\.integration|kyc-provider|t24-synthetic-webhook|t24-module-wiring)\\.e2e-spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/'],
};
