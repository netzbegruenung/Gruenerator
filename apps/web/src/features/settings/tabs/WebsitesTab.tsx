/**
 * "Meine Websites" — the account-level catalogue of connected websites.
 *
 * Deliberately shows what already sits in the notebooks ("X Beiträge in N
 * Notebooks"): that number is derived server-side from the documents, so it
 * answers "habe ich das schon importiert?" without the user having to open
 * every notebook.
 */
import { Button, Input, toast } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { HiGlobeAlt, HiRefresh, HiX } from 'react-icons/hi';

import { SettingsList, SettingsListRow } from '../components/SettingsListRow';
import SettingsSection from '../components/SettingsSection';
import { SettingsCardsSkeleton } from '../components/SettingsSkeleton';
import {
  useAddUserWebsite,
  useDeleteUserWebsite,
  useRefreshUserWebsite,
  userWebsitesQuery,
  useUserWebsites,
} from '../hooks/useUserWebsites';

export const prefetch = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(userWebsitesQuery);
};

function formatDiscovered(iso: string | null): string {
  if (!iso) return 'Noch nicht abgefragt';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'Noch nicht abgefragt';
  return `Zuletzt abgefragt am ${then.toLocaleDateString('de-DE')}`;
}

export default function WebsitesTab() {
  const { data: websites, isPending, isError } = useUserWebsites();
  const addWebsite = useAddUserWebsite();
  const refreshWebsite = useRefreshUserWebsite();
  const deleteWebsite = useDeleteUserWebsite();

  const [urlInput, setUrlInput] = useState('');

  const showError = (e: Error) => toast.error(e.message || 'Unbekannter Fehler');

  const handleRefresh = (websiteId: string) => {
    refreshWebsite.mutate(websiteId, { onError: showError });
  };

  const handleAdd = () => {
    const url = urlInput.trim();
    if (!url) return;
    addWebsite.mutate(url, {
      onSuccess: () => setUrlInput(''),
      onError: showError,
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Website hinzufügen"
        description="Verbinde deine Website, um ihre Beiträge in Notebooks zu nutzen. Die Kategorien werden einmal abgefragt und stehen dann überall zur Verfügung. Funktioniert mit WordPress-Websites, deren REST-API öffentlich erreichbar ist."
      >
        <div className="py-3">
          <label className="sr-only" htmlFor="website-url">
            Website hinzufügen
          </label>
          <div className="flex items-center gap-xs">
            <Input
              id="website-url"
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://gruene-beispielstadt.de"
              disabled={addWebsite.isPending}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={addWebsite.isPending || !urlInput.trim()}
            >
              {addWebsite.isPending ? 'Wird geprüft…' : 'Verbinden'}
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Verbundene Websites"
        aside={
          websites && websites.length > 0 ? (
            <span className="text-sm tabular-nums text-grey-600 dark:text-grey-400">
              {websites.length}
            </span>
          ) : undefined
        }
      >
        {isPending ? (
          <SettingsCardsSkeleton cards={2} />
        ) : isError ? (
          <p className="m-0 py-3 text-sm text-grey-600 dark:text-grey-400">
            Websites konnten nicht geladen werden.
          </p>
        ) : (
          <SettingsList
            isEmpty={!websites || websites.length === 0}
            empty="Noch keine Website verbunden."
          >
            {websites?.map((site) => (
              <SettingsListRow
                key={site.id}
                mark={<HiGlobeAlt size={16} />}
                name={<span title={site.siteUrl}>{site.siteName}</span>}
                meta={
                  <>
                    <div>
                      {site.categories.length} Kategorien · {site.totalPosts} Beiträge ·{' '}
                      {formatDiscovered(site.discoveredAt)}
                    </div>
                    <div>
                      {site.usage.documentCount > 0 ? (
                        <>
                          {site.usage.documentCount} Beiträge importiert
                          {site.usage.notebookCount > 0 && (
                            <> in {site.usage.notebookNames.join(', ')}</>
                          )}
                        </>
                      ) : (
                        'Noch nichts importiert'
                      )}
                    </div>
                  </>
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRefresh(site.id)}
                      disabled={refreshWebsite.isPending}
                      aria-label={`${site.siteName} aktualisieren`}
                    >
                      <HiRefresh size={12} />
                      Aktualisieren
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => deleteWebsite.mutate(site.id)}
                      disabled={deleteWebsite.isPending}
                      title="Bereits importierte Beiträge bleiben in den Notebooks."
                      aria-label={`${site.siteName} entfernen`}
                    >
                      <HiX size={12} />
                    </Button>
                  </>
                }
              />
            ))}
          </SettingsList>
        )}
      </SettingsSection>
    </div>
  );
}
