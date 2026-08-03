/**
 * Explicit Babel config, added so `babel-jest` (via the jest-expo preset) has
 * something to read.
 *
 * This is a no-op for Metro: with no config file, @expo/metro-config injects
 * `expo/internal/babel-preset`, which is literally
 * `module.exports = require('babel-preset-expo')` — the same preset declared
 * here. With a config file it `extends` this instead, which is the path every
 * Expo app created from the template takes.
 *
 * Keep the preset list exactly as-is. babel-preset-expo injects the
 * react-native-worklets plugin itself when Reanimated is installed; adding it
 * manually here double-applies it and breaks worklets at runtime.
 *
 * Static object rather than the `(api) => …` form on purpose: there is nothing
 * environment-dependent to compute, so there is no cache to configure.
 */
module.exports = {
  presets: ['babel-preset-expo'],
};
