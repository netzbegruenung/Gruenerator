const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Extend default watchFolders (which already includes all workspaces)
// with the pnpm hoisted .pnpm directory for proper resolution
config.watchFolders = [...(config.watchFolders || []), path.resolve(monorepoRoot, 'packages')];

// Exclude pnpm temp directories from file watching
config.resolver.blockList = [...(config.resolver.blockList || []), /_tmp_\d+/];

// Handle pnpm's symlinked node_modules structure
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules/.pnpm/node_modules'),
];

// Critical for pnpm: follow symlinks
config.resolver.unstable_enableSymlinks = true;

// Enable package exports for @gruenerator/shared subpath imports
config.resolver.unstable_enablePackageExports = true;

// Specify export conditions for React Native
config.resolver.unstable_conditionNames = ['require', 'import', 'react-native'];

// Resolve .js imports to .ts files (for ESM-style imports in shared package)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    const tsName = moduleName.replace(/\.js$/, '.ts');
    try {
      return context.resolveRequest(context, tsName, platform);
    } catch {
      // Fall through to default resolution
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

// NOTE: Do NOT set disableHierarchicalLookup=true — it breaks 'use dom' components
// because expo's internal module resolution needs to walk up from
// node_modules/expo/ to find sibling packages at the monorepo root.

module.exports = config;
