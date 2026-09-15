// Types
export type {
  ShareLink,
  WolkeFileItem,
  ConnectionTestResult,
  ConnectionErrorCode,
  ShareLinkValidationResult,
  ParsedShareLink,
  SharedWithMeLink,
  LinkGroupShare,
} from './types';

// API client
export {
  fetchShareLinks,
  addShareLink,
  deleteShareLink,
  testConnection,
  browseFolder,
  fetchSharedWithMe,
  fetchLinkGroupShares,
  shareLinkWithGroup,
  unshareLinkFromGroup,
} from './api/wolkeApiClient';

// Validation & utilities
export {
  validateShareLink,
  parseShareLink,
  generateDisplayName,
  generateDisplayUrl,
} from './lib/validation';
export { getFileIcon, buildNextcloudFileUrl, sortFoldersFirst } from './lib/fileUtils';
export { CONNECTION_ERROR_MESSAGES, connectionErrorMessage } from './lib/connectionErrors';

// React Query hooks
export {
  wolkeKeys,
  useShareLinks,
  useWolkeBrowse,
  useAddShareLink,
  useDeleteShareLink,
  useTestConnection,
  useSharedWithMeLinks,
  useLinkGroupShares,
  useShareLinkWithGroup,
  useUnshareLinkFromGroup,
} from './hooks/useWolke';

// Zustand store
export { default as useWolkePreferencesStore } from './stores/wolkePreferencesStore';
export type { WolkeFavouriteFolder } from './stores/wolkePreferencesStore';

// UI Components
export { default as WolkeFolderBrowser } from './components/WolkeFolderBrowser';
export { default as WolkeTreeBrowser } from './components/WolkeTreeBrowser';
export { default as FolderStarButton } from './components/FolderStarButton';
