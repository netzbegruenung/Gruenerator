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
// Exclude .claude/worktrees (sibling git worktrees, multi-GB with their own
// node_modules) — watching them blows past metro-file-map's 240s watch-start
// timeout ("Failed to start watch mode") on large checkouts.
config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  /_tmp_\d+/,
  /[/\\]\.claude([/\\]|$)/,
];

// Handle pnpm's symlinked node_modules structure
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// NOTE: pnpm symlink resolution is on by default in Metro (RN 0.86 / SDK 57) —
// the former `config.resolver.unstable_enableSymlinks = true` override is now
// redundant and flagged by expo-doctor ("Expected undefined"), so it's removed.

// Specify export conditions for React Native.
// 'development' matches the `development` condition in workspace packages
// (packages/shared, packages/contracts, services/hocuspocus) so Metro
// resolves to ./src/*.ts rather than ./dist/*.js. Mobile always bundles
// from source since Metro transforms TS directly.
config.resolver.unstable_conditionNames = ['development', 'require', 'react-native'];

// Custom resolver for various edge cases
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Dedupe React to a single physical copy for the whole bundle.
  // pnpm's `node-linker=hoisted` leaves several react@19.2.3 dirs on disk
  // (apps/mobile, react-native, @tanstack/react-query, @assistant-ui/*), and
  // Metro resolves `react` from each importer's own folder — so the bundle
  // otherwise ships multiple React instances with separate hook/context
  // internals. Cross-package context then misses: react-query throws
  // "No QueryClient set" once a subtree (e.g. the assistant-ui chat tree)
  // resolves a different React copy than the QueryClientProvider. Resolving
  // every react/react-dom request as if imported from the app root collapses
  // them to one instance (apps/mobile/node_modules/react, the Expo-pinned one).
  if (
    moduleName === 'react' ||
    moduleName.startsWith('react/') ||
    moduleName === 'react-dom' ||
    moduleName.startsWith('react-dom/')
  ) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, 'index.js') },
      moduleName,
      platform
    );
  }

  // Dedupe @tanstack/react-query (+ query-core) to a single physical copy, for
  // the same reason as React above. A within-range deps bump moved the shared
  // packages to react-query 5.101.0 while apps/mobile stayed at 5.100.9, so
  // Metro shipped two react-query modules — each creating its own
  // QueryClientContext. The chat tree (via @gruenerator/chat's
  // useFileMentionData) then read a different context than the app-root
  // QueryClientProvider, reviving "No QueryClient set" in the notebook/main
  // chat. Resolving every react-query request from the app root collapses them
  // to the one instance the provider uses (apps/mobile/node_modules).
  if (
    moduleName === '@tanstack/react-query' ||
    moduleName.startsWith('@tanstack/react-query/') ||
    moduleName === '@tanstack/query-core' ||
    moduleName.startsWith('@tanstack/query-core/')
  ) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, 'index.js') },
      moduleName,
      platform
    );
  }

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

module.exports = config;
