import { type DocumentSharing } from '../useDocumentSharing.js';

import { CollaboratorList } from './CollaboratorList.js';
import { GroupShareControls } from './GroupShareControls.js';
import { SaveAsTemplateSection } from './SaveAsTemplateSection.js';
import { ShareLinkRow } from './ShareLinkRow.js';
import { ShareModeSelect } from './ShareModeSelect.js';

interface ShareDialogBodyProps {
  sharing: DocumentSharing;
  /** Full share URL for the copy-link row (built per document kind). */
  shareUrl: string;
  /** Renders the save-as-template section when provided. */
  onSaveAsTemplate?: (title: string) => Promise<void>;
  defaultTemplateTitle?: string;
}

/**
 * Canonical body of the share dialog for collaborative documents (docs,
 * boards, canvas, sheets). Consumers wrap it in their own shell (modal,
 * settings section) and supply the kind-specific share URL.
 */
export const ShareDialogBody = ({
  sharing,
  shareUrl,
  onSaveAsTemplate,
  defaultTemplateTitle,
}: ShareDialogBodyProps) => {
  const {
    collaborators,
    shareSettings,
    userGroups,
    documentGroups,
    isLoading,
    setShareMode,
    setSharePermission,
    updatePermission,
    revokeAccess,
    shareWithGroup,
    updateGroupPermission,
    unshareFromGroup,
  } = sharing;

  if (isLoading || !shareSettings) {
    return <p className="py-md text-sm text-grey-500">Laden…</p>;
  }

  return (
    <div className="flex w-full flex-col gap-md">
      <ShareModeSelect
        value={shareSettings.share_mode}
        onChange={(mode) => setShareMode.mutate(mode)}
        disabled={setShareMode.isPending}
      />

      {shareSettings.share_mode !== 'private' && (
        <ShareLinkRow
          shareUrl={shareUrl}
          linkPermission={shareSettings.share_permission}
          onLinkPermissionChange={(permission) => setSharePermission.mutate(permission)}
        />
      )}

      <GroupShareControls
        userGroups={userGroups}
        groupShares={documentGroups}
        onShare={(groupId, permissionLevel) => shareWithGroup.mutate({ groupId, permissionLevel })}
        onUpdatePermission={(groupId, permissionLevel) =>
          updateGroupPermission.mutate({ groupId, permissionLevel })
        }
        onRemove={(groupId) => unshareFromGroup.mutate(groupId)}
        isSharing={shareWithGroup.isPending}
      />

      <CollaboratorList
        collaborators={collaborators}
        onUpdatePermission={(userId, permissionLevel) =>
          updatePermission.mutate({ userId, permissionLevel })
        }
        onRevoke={(userId) => revokeAccess.mutate(userId)}
      />

      {onSaveAsTemplate && (
        <SaveAsTemplateSection onSave={onSaveAsTemplate} defaultTitle={defaultTemplateTitle} />
      )}
    </div>
  );
};
