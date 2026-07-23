/**
 * "Meine Websites" — the account-level catalogue of connected websites.
 *
 * Deliberately shows what already sits in the notebooks ("X Beiträge in N
 * Notebooks"): that number is derived server-side from the documents, so it
 * answers "habe ich das schon importiert?" without the user having to open
 * every notebook.
 */
import { Button, Input, SectionHeader } from '@gruenerator/ui';
import { useState } from 'react';
import { HiExclamation, HiGlobeAlt, HiRefresh, HiX } from 'react-icons/hi';

import {
  useAddUserWebsite,
  useDeleteUserWebsite,
  useRefreshUserWebsite,
  useUserWebsites,
} from '../hooks/useUserWebsites';

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
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const url = urlInput.trim();
    if (!url) return;
    setError(null);
    addWebsite.mutate(url, {
      onSuccess: () => setUrlInput(''),
      onError: (e) => setError(e instanceof Error ? e.message : 'Unbekannter Fehler'),
    });
  };

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <p className="m-0 text-sm text-grey-500">
          Verbinde deine Website, um ihre Beiträge in Notebooks zu nutzen. Die Kategorien werden
          einmal abgefragt und stehen dann überall zur Verfügung.
        </p>
      </div>

      <div className="flex flex-col gap-xs rounded-xl border border-dashed border-grey-300 bg-background p-md dark:border-grey-700">
        <label className="text-sm font-medium text-foreground" htmlFor="website-url">
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
        <p className="m-0 text-xs text-grey-500">
          Funktioniert mit WordPress-Websites, deren REST-API öffentlich erreichbar ist.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-xs rounded-md bg-amber-50 px-sm py-xs text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <HiExclamation size={14} className="mt-[1px] shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <section className="flex flex-col gap-md">
        <SectionHeader
          title="Verbundene Websites"
          actions={
            websites && websites.length > 0 ? (
              <span className="text-sm text-grey-500">{websites.length}</span>
            ) : undefined
          }
        />

        {isPending ? (
          <p className="m-0 text-sm text-grey-500">Wird geladen…</p>
        ) : isError ? (
          <p className="m-0 text-sm text-grey-500">Websites konnten nicht geladen werden.</p>
        ) : !websites || websites.length === 0 ? (
          <p className="m-0 text-sm text-grey-500">Noch keine Website verbunden.</p>
        ) : (
          <div className="flex flex-col gap-sm">
            {websites.map((site) => (
              <div
                key={site.id}
                className="flex flex-col gap-sm rounded-xl border border-grey-200 bg-background p-md dark:border-grey-800 sm:flex-row sm:items-center"
              >
                <HiGlobeAlt
                  size={18}
                  className="shrink-0 text-secondary-600 dark:text-secondary-400"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-medium text-foreground"
                    title={site.siteUrl}
                  >
                    {site.siteName}
                  </div>
                  <div className="mt-[2px] text-xs text-grey-500">
                    {site.categories.length} Kategorien · {site.totalPosts} Beiträge ·{' '}
                    {formatDiscovered(site.discoveredAt)}
                  </div>
                  <div className="mt-xs text-xs text-grey-500">
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
                </div>
                <div className="flex shrink-0 items-center gap-xs">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => refreshWebsite.mutate(site.id)}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
