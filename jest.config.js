/**
 * Jest configuration for React Native.
 * Mocks binary assets and transpiles navigation packages that ship untranspiled code.
 */
module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/__mocks__/fileMock.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '@react-native' +
      '|react-native' +
      '|@react-navigation' +
      '|react-native-gesture-handler' +
      '|react-native-screens' +
      '|react-native-safe-area-context' +
      '|@noble' +
      '|@zkpassport' +
      '|@zk-kit' +
      ')/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
