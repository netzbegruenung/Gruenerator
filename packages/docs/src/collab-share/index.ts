/**
 * Sharing for collaborative documents (docs, boards, canvas, sheets).
 */

export type {
  ShareMode,
  SharePermissionLevel,
  SharingCollaborator,
  SharingShareSettings,
  SharingUserGroup,
  SharingGroupShare,
  CollabShareApiClient,
} from './types.js';

export { SHARE_MODE_OPTIONS, PERMISSION_LEVEL_LABELS } from './constants.js';

export {
  useDocumentSharing as useCollabDocSharing,
  type DocumentSharing,
} from './useDocumentSharing.js';

export { ShareDialogBody } from './components/ShareDialogBody.js';
export { ShareModeSelect } from './components/ShareModeSelect.js';
export { ShareLinkRow } from './components/ShareLinkRow.js';
export { GroupShareControls } from './components/GroupShareControls.js';
export { CollaboratorList } from './components/CollaboratorList.js';
export { SaveAsTemplateSection } from './components/SaveAsTemplateSection.js';
