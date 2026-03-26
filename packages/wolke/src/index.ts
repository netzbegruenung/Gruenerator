// Types
export type {
  WolkeScope,
  ShareLink,
  WolkeFileItem,
  SyncStatus,
  ConnectionTestResult,
  ConnectionErrorCode,
  ShareLinkValidationResult,
  ParsedShareLink,
} from './types';

// API client
export {
  fetchShareLinks,
  addShareLink,
  deleteShareLink,
  testConnection,
  uploadToWolke,
  browseFolder,
  fetchSyncStatuses,
  syncFolder,
  setAutoSync,
} from './api/wolkeApiClient';

// Validation & utilities
export {
  validateShareLink,
  parseShareLink,
  generateDisplayName,
  generateDisplayUrl,
} from './lib/validation';
export { getFileIcon, buildNextcloudFileUrl, sortFoldersFirst } from './lib/fileUtils';

// React Query hooks
export {
  wolkeKeys,
  useShareLinks,
  useSyncStatuses,
  useWolkeFiles,
  useWolkeBrowse,
  useAddShareLink,
  useDeleteShareLink,
  useTestConnection,
  useUploadToWolke,
  useSyncFolder,
  useSetAutoSync,
} from './hooks/useWolke';

// Zustand store
export { default as useWolkePreferencesStore } from './stores/wolkePreferencesStore';
export type {
  WolkeFavouriteFolder,
  WolkeAutoBackupConfig,
  WolkeTransferFolderConfig,
  BackupInterval,
} from './stores/wolkePreferencesStore';

// UI Components
export { default as WolkeFolderBrowser } from './components/WolkeFolderBrowser';
export { default as WolkeTreeBrowser } from './components/WolkeTreeBrowser';
export { default as FolderStarButton } from './components/FolderStarButton';
export { WolkeSaveModal } from './components/WolkeSaveModal';
