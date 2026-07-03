import { saveCollaborativeDocAsTemplate } from '@gruenerator/shared';
import { ShareDialogBody } from '@gruenerator/shared/collab-share';
import { memo } from 'react';

import { getPublicAppOrigin } from '../../../../../utils/platform';
import { useBoardSharing } from '../../../hooks/useBoardSharing';

interface ShareSectionProps {
  boardId: string;
  /** Hidden when embedded in a dialog that supplies its own title. */
  showHeading?: boolean;
}

/**
 * Sharing, permissions and save-as-template for the board settings overlay.
 * Composed from the shared collab-share components; driven by
 * {@link useBoardSharing}.
 */
export const ShareSection = memo(function ShareSection({
  boardId,
  showHeading = true,
}: ShareSectionProps) {
  const sharing = useBoardSharing(boardId);

  const isPublicOrAuth =
    sharing.shareSettings?.share_mode && sharing.shareSettings.share_mode !== 'private';
  const shareUrl = isPublicOrAuth
    ? `${getPublicAppOrigin()}/boards/public/${boardId}`
    : `${getPublicAppOrigin()}/boards/${boardId}`;

  return (
    <section className="flex w-full max-w-[42rem] flex-col gap-md">
      {showHeading && (
        <div>
          <h2 className="text-base font-semibold text-foreground">Teilen &amp; Berechtigungen</h2>
          <p className="mt-0.5 text-sm text-grey-500">
            Verwalte, wer auf dieses Board zugreifen kann.
          </p>
        </div>
      )}

      <ShareDialogBody
        sharing={sharing}
        shareUrl={shareUrl}
        onSaveAsTemplate={async (title) => {
          await saveCollaborativeDocAsTemplate({
            documentId: boardId,
            title,
            isPrivate: true,
          });
        }}
      />
    </section>
  );
});
