const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Handle pnpm's symlinked node_modules structure
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Critical for pnpm: follow symlinks
config.resolver.unstable_enableSymlinks = true;

// Enable package exports - THIS IS KEY for @gruenerator/shared/api etc
config.resolver.unstable_enablePackageExports = true;

// Specify export conditions for React Native
config.resolver.unstable_conditionNames = ['require', 'import', 'react-native'];

// Ensure Metro can resolve packages hoisted to monorepo root
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
