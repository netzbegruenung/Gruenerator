const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch specific folders in the monorepo (not root to avoid resolution issues)
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Exclude pnpm temp directories from file watching (they get cleaned up and cause ENOENT errors)
config.watcher = {
  ...config.watcher,
  additionalExts: config.watcher?.additionalExts || [],
};
config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  /_tmp_\d+/,
];

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

// Custom resolver for various edge cases
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Handle entities/lib/maps/entities.json - markdown-it needs this but entities package
  // doesn't export it. Resolve directly to the file.
  if (moduleName === 'entities/lib/maps/entities.json') {
    const entitiesPath = path.resolve(
      monorepoRoot,
      'node_modules/markdown-it/node_modules/entities/lib/maps/entities.json'
    );
    return { type: 'sourceFile', filePath: entitiesPath };
  }

  // Disable package exports for @babel/runtime to fix interop issues
  // The slider package uses babel runtime helpers that break with package exports
  if (moduleName.startsWith('@babel/runtime/')) {
    // Add .js extension if not present
    const helperPath = moduleName.endsWith('.js')
      ? path.resolve(monorepoRoot, 'node_modules', moduleName)
      : path.resolve(monorepoRoot, 'node_modules', moduleName + '.js');
    return { type: 'sourceFile', filePath: helperPath };
  }

  // Resolve .js imports to .ts files (for ESM-style imports in shared package)
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

// Ensure Metro can resolve packages hoisted to monorepo root
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
