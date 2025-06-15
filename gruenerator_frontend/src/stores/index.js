/**
 * Zustand Stores - Centralized Export
 * Clean imports for all stores and related hooks
 */

// Middlewares (for future store implementations)
export { localStorageMiddleware, loadFromLocalStorage } from './middlewares/localStorageMiddleware';
export { apiCheckMiddleware, createApiValidationConfig } from './middlewares/apiCheckMiddleware';
export { crossTabSyncMiddleware, createCrossTabSyncConfig } from './middlewares/crossTabSyncMiddleware';

// Test Components
export { default as BetaFeaturesMigrationTest } from '../components/test/BetaFeaturesMigrationTest';

// Active stores:
export { default as useGeneratedTextStore } from './core/generatedTextStore';

// Future stores will be exported here:
// export { useCollabEditorStore } from './collabEditorStore';
// export { useSupabaseAuthStore } from './supabaseAuthStore'; 