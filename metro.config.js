const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const aliases = {
  '@zkpassport/utils/circuits': path.resolve(__dirname, 'node_modules/@zkpassport/utils/dist/esm/circuits/index.js'),
  '@zkpassport/utils/registry': path.resolve(__dirname, 'node_modules/@zkpassport/utils/dist/esm/registry/index.js'),
  'ethers/utils': path.resolve(__dirname, 'node_modules/ethers/lib.esm/utils/index.js'),
};

const config = {
  resolver: {
    ...defaultConfig.resolver,
    resolveRequest: (context, moduleName, platform) => {
      if (aliases[moduleName]) {
        return { filePath: aliases[moduleName], type: 'sourceFile' };
      }
      // @peculiar/utils (pulled in by the newer @peculiar/asn1-* packages that
      // @zkpassport/utils 0.36 depends on) exposes its submodules only through the
      // package "exports" map (./bytes, ./converters, ./encoding, ./legacy, ./pem).
      // This Metro version does not resolve subpath exports, so map them explicitly to
      // the cjs build — matching the manual-alias approach used above.
      const peculiarUtils = moduleName.match(/^@peculiar\/utils\/([a-z]+)$/);
      if (peculiarUtils) {
        return {
          filePath: path.resolve(
            __dirname,
            `node_modules/@peculiar/utils/build/cjs/${peculiarUtils[1]}/index.js`,
          ),
          type: 'sourceFile',
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
