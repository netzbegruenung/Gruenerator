import { motion } from 'motion/react';
import React, { useState, useCallback, memo, useMemo } from 'react';

// Common components
import ShareToGroupModal from '../../../../../../components/common/ShareToGroupModal';

// Content section
import DocumentsSection from './components/DocumentsSection';

type ShareableContentType =
  | 'documents'
  | 'custom_generators'
  | 'notebook_collections'
  | 'user_documents'
  | 'database';

interface ShareContent {
  type: ShareableContentType;
  id: string;
  title: string;
}

interface ContentManagementViewProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

// Static animation config moved outside component
const MOTION_CONFIG = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3 },
} as const;

const ContentManagementView = memo(
  ({
    isActive,
    onSuccessMessage,
    onErrorMessage,
  }: ContentManagementViewProps): React.ReactElement => {
    // Modal state for sharing
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareContent, setShareContent] = useState<ShareContent | null>(null);

    // Share functionality
    const handleShareToGroup = useCallback(
      async (contentType: ShareableContentType, contentId: string, contentTitle: string) => {
        setShareContent({
          type: contentType,
          id: contentId,
          title: contentTitle,
        });
        setShowShareModal(true);
      },
      []
    );

    const handleCloseShareModal = useCallback(() => {
      setShowShareModal(false);
      setShareContent(null);
    }, []);

    const handleShareSuccess = useCallback(
      (message: string) => {
        onSuccessMessage(message);
        handleCloseShareModal();
      },
      [onSuccessMessage, handleCloseShareModal]
    );

    const handleShareError = useCallback(
      (error: string) => {
        onErrorMessage(error);
      },
      [onErrorMessage]
    );

    // Memoized callback for DocumentsSection to prevent inline function recreation
    const handleDocumentShareToGroup = useCallback(
      (contentType: string, contentId: string, contentTitle: string) => {
        void handleShareToGroup(contentType as ShareableContentType, contentId, contentTitle);
      },
      [handleShareToGroup]
    );

    return (
      <motion.div
        className="flex flex-col gap-lg"
        initial={MOTION_CONFIG.initial}
        animate={MOTION_CONFIG.animate}
        transition={MOTION_CONFIG.transition}
      >
        <DocumentsSection
          isActive={isActive}
          onSuccessMessage={onSuccessMessage}
          onErrorMessage={onErrorMessage}
          onShareToGroup={handleDocumentShareToGroup}
        />

        {showShareModal && shareContent && (
          <ShareToGroupModal
            isOpen={showShareModal}
            onClose={handleCloseShareModal}
            contentType={shareContent.type}
            contentId={shareContent.id}
            contentTitle={shareContent.title}
            onSuccess={handleShareSuccess}
            onError={handleShareError}
          />
        )}
      </motion.div>
    );
  }
);

ContentManagementView.displayName = 'ContentManagementView';

export default ContentManagementView;
