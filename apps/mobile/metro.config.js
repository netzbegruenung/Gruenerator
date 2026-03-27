const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Ensure projectRoot is absolute (getDefaultConfig may return '.' which breaks in monorepos)
config.projectRoot = projectRoot;

// Extend default watchFolders (which includes all workspaces) with monorepo packages.
// NOTE: Must spread defaults — replacing them breaks 'use dom' component path resolution.
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(monorepoRoot, 'packages'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Exclude pnpm temp directories from file watching (they get cleaned up and cause ENOENT errors)
config.watcher = {
  ...config.watcher,
  additionalExts: config.watcher?.additionalExts || [],
};
config.resolver.blockList = [...(config.resolver.blockList || []), /_tmp_\d+/];

// Handle pnpm's symlinked node_modules structure
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Critical for pnpm: follow symlinks
config.resolver.unstable_enableSymlinks = true;

// Specify export conditions for React Native
config.resolver.unstable_conditionNames = ['require', 'react-native'];

// Custom resolver for various edge cases
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fix 'use dom' component resolution in monorepo.
  // The DOM transformer generates a relative path from node_modules/expo/dom/entry.js
  // to the component, but miscounts directory levels in a pnpm monorepo.
  // The generated path has one extra '..' — fix by resolving against projectRoot.
  if (
    moduleName.includes('apps/mobile/components/') &&
    context.originModulePath?.includes('node_modules/expo/dom/')
  ) {
    const componentRelative = moduleName.replace(/^\.\/[./]*/, '');
    const absolutePath = path.resolve(monorepoRoot, componentRelative);
    return { type: 'sourceFile', filePath: absolutePath };
  }

  // Shim isomorphic-webcrypto — its RN entry crashes in Android WebView
  // by writing to read-only navigator.userAgent getter
  if (moduleName === 'isomorphic-webcrypto' || moduleName.startsWith('isomorphic-webcrypto/')) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(projectRoot, 'shims/isomorphic-webcrypto.js'),
    };
  }

  // Handle entities/lib/maps/entities.json - markdown-it needs this but entities package
  // doesn't export it. Resolve directly to the file.
  if (moduleName === 'entities/lib/maps/entities.json') {
    const entitiesPath = path.resolve(
      monorepoRoot,
      'node_modules/markdown-it/node_modules/entities/lib/maps/entities.json'
    );
    return { type: 'sourceFile', filePath: entitiesPath };
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

// NOTE: Do NOT set disableHierarchicalLookup=true — it breaks 'use dom' components
// because expo's internal module resolution needs to walk up from
// node_modules/expo/ to find sibling packages at the monorepo root.

// NOTE: Do NOT wrap with withSentryConfig() — it breaks 'use dom' components.
// Sentry's resolver wrapper drops the 4th parameter (oldMetroModuleName) when calling
// context.resolveRequest(), which breaks Expo's DOM path calculation.
module.exports = config;
