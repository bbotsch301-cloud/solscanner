/* eslint-disable @typescript-eslint/no-require-imports */
// Metro config extends Expo's default with pure-JS shims WalletConnect's transitive
// deps expect (crypto/stream/buffer). These are JS polyfills so they stay Expo Go
// compatible — no native modules. If bundling still complains about a Node builtin,
// add its browser shim here.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  crypto: require.resolve("crypto-browserify"),
  stream: require.resolve("stream-browserify"),
  buffer: require.resolve("buffer"),
};

module.exports = config;
