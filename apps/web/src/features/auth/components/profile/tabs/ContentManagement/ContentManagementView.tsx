import { motion } from 'motion/react';
import React, { memo } from 'react';

import DocumentsSection from './components/DocumentsSection';

interface ContentManagementViewProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

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
    return (
      <motion.div
        className="flex flex-col gap-lg"
        initial={MOTION_CONFIG.initial}
        animate={MOTION_CONFIG.animate}
        transition={MOTION_CONFIG.transition}
      >
        <div className="rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-md">
          <p className="text-sm text-yellow-800 dark:text-yellow-300 m-0">
            Diese Seite wird bald entfernt. Deine gespeicherten Texte findest du jetzt unter{' '}
            <a href="/recherche" className="font-medium underline hover:no-underline">Recherche</a>.
            Hochgeladene Dokumente kannst du hier noch bis Juni 2026 herunterladen.
          </p>
        </div>
        <DocumentsSection
          isActive={isActive}
          onSuccessMessage={onSuccessMessage}
          onErrorMessage={onErrorMessage}
        />
      </motion.div>
    );
  }
);

ContentManagementView.displayName = 'ContentManagementView';

export default ContentManagementView;
