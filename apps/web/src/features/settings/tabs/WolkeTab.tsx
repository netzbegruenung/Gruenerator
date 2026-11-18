import { Button, toast } from '@gruenerator/ui';
import {
  fetchShareLinks,
  useShareLinks,
  useSharedWithMeLinks,
  wolkeKeys,
} from '@gruenerator/wolke';
import { type QueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { SettingsList } from '../components/SettingsListRow';
import SettingsSection from '../components/SettingsSection';
import { SettingsCardsSkeleton } from '../components/SettingsSkeleton';

import SharedWolkeConnectionCard from '@/features/wolke/components/SharedWolkeConnectionCard';
import WolkeAddForm from '@/features/wolke/components/WolkeAddForm';
import WolkeConnectionCard from '@/features/wolke/components/WolkeConnectionCard';
import WolkeSetupWizard from '@/features/wolke/components/WolkeSetupWizard';

const onSuccess = (message: string) => toast.success(message);
const onError = (message: string) => toast.error(message);

// The Friends tab reads the same connections (Wolki stays locked without one),
// so warming this here pays off for both.
export const prefetch = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery({
    queryKey: wolkeKeys.shareLinks(),
    queryFn: () => fetchShareLinks(),
    staleTime: 30_000,
  });
};

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

  const showEmpty = !isLoading && shareLinks.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Grüne Wolke"
        description={
          showEmpty
            ? 'Verbinde deine Wolke. Dann findet der Grünerator deine Dateien und legt Ergebnisse dort ab.'
            : undefined
        }
        aside={
          hasLinks ? (
            <>
              <span className="text-sm tabular-nums text-grey-600 dark:text-grey-400">
                {shareLinks.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={showManualForm}
                onClick={() => setShowManualForm((v) => !v)}
              >
                Hinzufügen
              </Button>
            </>
          ) : undefined
        }
      >
        {isLoading && <SettingsCardsSkeleton cards={2} />}

        {hasLinks && showManualForm && (
          <div className="py-3">
            <WolkeAddForm onSuccess={handleWizardSuccess} onError={onError} />
          </div>
        )}

        {hasLinks && (
          <SettingsList>
            {shareLinks.map((link) => (
              <WolkeConnectionCard
                key={link.id}
                shareLink={link}
                onSuccess={onSuccess}
                onError={onError}
              />
            ))}
          </SettingsList>
        )}

        {showEmpty && !showManualForm && !showWizard && (
          <div className="flex flex-col items-start gap-sm py-4 text-sm text-grey-600 dark:text-grey-400">
            <span>Noch keine Wolke verbunden.</span>
            <div className="flex flex-wrap gap-xs">
              <Button type="button" size="sm" onClick={() => setShowWizard(true)}>
                Einrichtung starten
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowManualForm(true)}
              >
                oder manuell einrichten
              </Button>
            </div>
          </div>
        )}

        {showEmpty && showManualForm && (
          <div className="py-3">
            <WolkeAddForm onSuccess={handleWizardSuccess} onError={onError} />
          </div>
        )}

        {showEmpty && showWizard && (
          <div className="py-3">
            <WolkeSetupWizard
              onSuccess={handleWizardSuccess}
              onError={onError}
              onCancel={() => setShowWizard(false)}
            />
          </div>
        )}
      </SettingsSection>

      {hasSharedWithMe && (
        <SettingsSection
          title="Mit mir geteilt"
          aside={
            <span className="text-sm tabular-nums text-grey-600 dark:text-grey-400">
              {sharedWithMe.length}
            </span>
          }
        >
          <SettingsList>
            {sharedWithMe.map((entry) => (
              <SharedWolkeConnectionCard
                key={`${entry.groupId}:${entry.link.id}`}
                entry={entry}
                onSuccess={onSuccess}
                onError={onError}
              />
            ))}
          </SettingsList>
        </SettingsSection>
      )}
    </div>
  );
};

export default WolkeTab;
