import { motion } from 'motion/react';
import { memo } from 'react';
import { FiCloud } from 'react-icons/fi';

import WolkeAddForm from '../../../../../wolke/components/WolkeAddForm';
import WolkeConnectionCard from '../../../../../wolke/components/WolkeConnectionCard';
import { useShareLinks } from '../../../../../wolke/hooks/useWolke';

interface WolkeManagementViewProps {
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

const MOTION_CONFIG = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3 },
} as const;

const WolkeManagementView = memo(
  ({ onSuccessMessage, onErrorMessage }: WolkeManagementViewProps) => {
    const { data: shareLinks = [], isLoading } = useShareLinks();

    return (
      <motion.div
        className="flex flex-col gap-lg"
        initial={MOTION_CONFIG.initial}
        animate={MOTION_CONFIG.animate}
        transition={MOTION_CONFIG.transition}
      >
        <div className="flex flex-col gap-xs">
          <div className="flex items-center gap-xs">
            <FiCloud className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-foreground-heading m-0">Wolke</h2>
          </div>
          <p className="text-sm text-grey-500 dark:text-grey-400 m-0">
            Verbinde deine Nextcloud-Wolke, um Dateien direkt aus dem Grünerator zu synchronisieren
            und zu exportieren.
          </p>
        </div>

        <div className="rounded-lg border border-grey-200 dark:border-grey-700 bg-background-pure p-md">
          <h3 className="text-sm font-medium text-foreground mb-sm">Verbindung hinzufügen</h3>
          <WolkeAddForm onSuccess={onSuccessMessage} onError={onErrorMessage} />
        </div>

        {isLoading && (
          <div className="text-sm text-grey-400 text-center py-md">Lade Verbindungen...</div>
        )}

        {!isLoading && shareLinks.length > 0 && (
          <div className="flex flex-col gap-sm">
            <h3 className="text-sm font-medium text-grey-500 dark:text-grey-400">
              Verbindungen ({shareLinks.length})
            </h3>
            {shareLinks.map((link) => (
              <WolkeConnectionCard
                key={link.id}
                shareLink={link}
                onSuccess={onSuccessMessage}
                onError={onErrorMessage}
              />
            ))}
          </div>
        )}

        {!isLoading && shareLinks.length === 0 && (
          <div className="flex flex-col items-center gap-sm py-xl text-grey-400">
            <FiCloud className="w-12 h-12 opacity-30" />
            <p className="text-sm text-center">
              Noch keine Wolke-Verbindungen eingerichtet.
              <br />
              Füge oben einen Share-Link hinzu, um zu beginnen.
            </p>
          </div>
        )}
      </motion.div>
    );
  }
);

WolkeManagementView.displayName = 'WolkeManagementView';

export default WolkeManagementView;
