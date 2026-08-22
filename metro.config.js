const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Native builds use a filesystem CSS cache for stable device development.
  // Static web export must keep CSS virtual: a fresh CI checkout can otherwise
  // ask Metro to hash a NativeWind cache file that does not exist yet.
  forceWriteFileSystem: process.env.EXPO_STATIC_WEB_EXPORT !== "1",
});
