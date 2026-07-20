import { toast } from '@gruenerator/ui';
import { useShareLinks, useSharedWithMeLinks } from '@gruenerator/wolke';
import { useCallback, useState } from 'react';

import AutoBackupSection from '@/features/wolke/components/AutoBackupSection';
import CloudButton from '@/features/wolke/components/CloudButton';
import SharedWolkeConnectionCard from '@/features/wolke/components/SharedWolkeConnectionCard';
import WolkeAddForm from '@/features/wolke/components/WolkeAddForm';
import WolkeConnectionCard from '@/features/wolke/components/WolkeConnectionCard';
import WolkeSetupWizard from '@/features/wolke/components/WolkeSetupWizard';

const onSuccess = (message: string) => toast.success(message);
const onError = (message: string) => toast.error(message);

const WolkeTab = () => {
  const { data: shareLinks = [], isLoading } = useShareLinks();
  const { data: sharedWithMe = [] } = useSharedWithMeLinks();
  const [showWizard, setShowWizard] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  const hasLinks = !isLoading && shareLinks.length > 0;
  const hasSharedWithMe = sharedWithMe.length > 0;

  const handleWizardSuccess = useCallback((message: string) => {
    setShowWizard(false);
    setShowManualForm(false);
    onSuccess(message);
  }, []);

  return (
    <div className="flex flex-col gap-xl">
      {(hasLinks || showManualForm) && <WolkeAddForm onSuccess={onSuccess} onError={onError} />}

      {isLoading && <p className="py-sm text-center text-sm text-grey-400">Lade Verbindungen...</p>}

      {hasLinks && (
        <div className="flex flex-col gap-sm">
          <h3 className="m-0 text-sm font-medium uppercase tracking-wide text-grey-600 dark:text-grey-300">
            Verbindungen ({shareLinks.length})
          </h3>
          {shareLinks.map((link) => (
            <WolkeConnectionCard
              key={link.id}
              shareLink={link}
              onSuccess={onSuccess}
              onError={onError}
            />
          ))}
        </div>
      )}

      {!isLoading && shareLinks.length === 0 && !showManualForm && !showWizard && (
        <div className="flex flex-col items-center gap-sm py-lg">
          <CloudButton onClick={() => setShowWizard(true)} />
          <button
            type="button"
            onClick={() => setShowManualForm(true)}
            className="mt-sm text-xs text-grey-400 transition-colors hover:text-foreground hover:underline"
          >
            oder manuell einrichten
          </button>
        </div>
      )}

      {!isLoading && shareLinks.length === 0 && showWizard && (
        <WolkeSetupWizard
          onSuccess={handleWizardSuccess}
          onError={onError}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {hasSharedWithMe && (
        <>
          <hr className="border-grey-200 dark:border-grey-700" />
          <div className="flex flex-col gap-sm">
            <h3 className="m-0 text-sm font-medium uppercase tracking-wide text-grey-600 dark:text-grey-300">
              Mit mir geteilte Wolke-Links ({sharedWithMe.length})
            </h3>
            {sharedWithMe.map((entry) => (
              <SharedWolkeConnectionCard
                key={`${entry.groupId}:${entry.link.id}`}
                entry={entry}
                onSuccess={onSuccess}
                onError={onError}
              />
            ))}
          </div>
        </>
      )}

      {hasLinks && (
        <>
          <hr className="border-grey-200 dark:border-grey-700" />
          <AutoBackupSection />
        </>
      )}
    </div>
  );
};

export default WolkeTab;
