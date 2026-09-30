import {
  NOTEBOOK_MAX_DOCUMENTS,
  type UserWebsite,
  type WordpressSiteRef,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import {
  Badge,
  Button,
  Input,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
  useConfirm,
} from '@gruenerator/ui';
import { useState } from 'react';
import { HiChevronRight, HiGlobeAlt } from 'react-icons/hi';

import { cn } from '../../../../utils/cn';
import { useAddUserWebsite, useUserWebsites } from '../../../settings/hooks/useUserWebsites';
import { wpErrorMessage, WP_ERROR_MESSAGES } from '../../hooks/useWordpressDiscovery';

import { type WordpressGroup } from './hubSources';
import { EmptySources } from './PanelChrome';
import { StatusDot } from './StatusDot';
import {
  applyImport,
  summarizeImport,
  WordpressSelection,
  type WordpressImportOutcome,
} from './WordpressSelection';

import type { NotebookHubApi } from './useNotebookHub';

const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i;

/** Vergleichsform einer Website-Adresse: ohne Schema, `www.` und Schrägstrich am Ende. */
export function normalizeSiteUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

type SheetState =
  | { mode: 'detail'; websiteId: string }
  | { mode: 'select'; websiteId: string; siteUrl: string; name: string };

interface WordpressPanelProps {
  hub: NotebookHubApi;
  groups: WordpressGroup[];
  total: number;
}

function selectionSummary(site: WordpressSiteRef): string {
  const parts: string[] = [];
  if (site.allPosts) parts.push('Alle Beiträge');
  else if (site.categories.length > 0)
    parts.push(
      site.categories.length === 1
        ? site.categories[0].name
        : `${site.categories.length} Kategorien`
    );
  if (site.pages) {
    const n = site.selectedPages?.length ?? 0;
    parts.push(n > 0 ? `${n} Seiten` : 'Alle Seiten');
  }
  return parts.join(' · ') || 'Keine Auswahl';
}

export function WordpressPanel({ hub, groups, total }: WordpressPanelProps) {
  const confirm = useConfirm();
  const catalogue = useUserWebsites();
  const addWebsite = useAddUserWebsite();
  const [url, setUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const sites = groups.map((g) => g.site);
  const websiteOf = (id: string): UserWebsite | null =>
    catalogue.data?.find((w) => w.id === id) ?? null;
  const room = Math.max(0, NOTEBOOK_MAX_DOCUMENTS - total);

  const urlValid = URL_RE.test(url.trim());
  const existing = urlValid
    ? (catalogue.data ?? []).find((w) => normalizeSiteUrl(w.siteUrl) === normalizeSiteUrl(url))
    : undefined;
  const duplicate = Boolean(existing && sites.some((s) => s.websiteId === existing.id));

  const persist = async (outcome: WordpressImportOutcome, previous: WordpressSiteRef | null) => {
    await hub.addDocuments(outcome.added);
    if (outcome.removed.length > 0) await hub.removeDocuments(outcome.removed);
    await hub.saveMeta({
      wordpress_sites: previous
        ? sites.map((s) => (s.websiteId === previous.websiteId ? outcome.ref : s))
        : [...sites, outcome.ref],
    });
    toast.success(outcome.summary);
  };

  const connect = async () => {
    if (!urlValid || duplicate || connecting) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const website = existing ?? (await addWebsite.mutateAsync(url.trim()));
      setSheet({
        mode: 'select',
        websiteId: website.id,
        siteUrl: website.siteUrl,
        name: website.siteName,
      });
      setUrl('');
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : WP_ERROR_MESSAGES.fetch_failed);
    } finally {
      setConnecting(false);
    }
  };

  const sync = async (site: WordpressSiteRef) => {
    const website = websiteOf(site.websiteId);
    if (!website) {
      toast.error('Diese Website ist nicht mehr mit deinem Konto verbunden.');
      return;
    }
    setSyncing(site.websiteId);
    try {
      const result = await getContractsClient().notebookWordpress.importSite({
        body: {
          site_url: website.siteUrl,
          categories: site.categories,
          all_posts: site.allPosts,
          pages: site.pages,
          page_ids: site.selectedPages?.length ? site.selectedPages.map((p) => p.id) : null,
          modified_after: site.lastSyncedAt ?? null,
          known_document_ids: site.documentIds,
          max_new_documents: room,
        },
      });
      if (result.status !== 200) {
        toast.error(wpErrorMessage(result.body));
        return;
      }
      const { documentIds, added, removed } = applyImport(result.body, site.documentIds);
      await persist(
        {
          ref: { ...site, documentIds, lastSyncedAt: new Date().toISOString() },
          added,
          removed,
          summary: summarizeImport(result.body),
        },
        site
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : WP_ERROR_MESSAGES.fetch_failed);
    } finally {
      setSyncing(null);
    }
  };

  const disconnect = async (group: WordpressGroup) => {
    const name = websiteOf(group.site.websiteId)?.siteName ?? 'Website';
    const ok = await confirm({
      title: `„${name}" trennen?`,
      description: `Die ${group.documents.length} importierten Beiträge werden aus dem Notebook entfernt. Die Website bleibt in deinem Konto verbunden.`,
      confirmLabel: 'Trennen',
    });
    if (!ok) return;
    try {
      await hub.saveMeta({
        wordpress_sites: sites.filter((s) => s.websiteId !== group.site.websiteId),
      });
      if (group.documents.length > 0) await hub.removeDocuments(group.documents.map((d) => d.id));
      setSheet(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trennen fehlgeschlagen.');
    }
  };

  const selected = sheet
    ? (groups.find((g) => g.site.websiteId === sheet.websiteId) ?? null)
    : null;
  const selectedWebsite = sheet ? websiteOf(sheet.websiteId) : null;
  const sheetTitle =
    sheet?.mode === 'select' ? sheet.name : (selectedWebsite?.siteName ?? 'Unbekannte Website');

  return (
    <section aria-label="WordPress-Websites" className="flex flex-col gap-md">
      <div className="flex flex-col gap-xs">
        <div className="flex items-center gap-xs">
          <label htmlFor="hub-wp-url" className="text-sm font-semibold">
            WordPress-Website hinzufügen
          </label>
          <Badge variant="outline">Beta</Badge>
        </div>
        <div className="flex flex-wrap gap-xs">
          <Input
            id="hub-wp-url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setConnectError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void connect();
            }}
            placeholder="https://gruene-beispiel.de"
            aria-invalid={Boolean(url && !urlValid) || duplicate || Boolean(connectError)}
            aria-describedby="hub-wp-hint"
            className="h-9 min-w-0 flex-[1_1_15rem]"
          />
          <Button
            variant="brand"
            size="brand-sm"
            onClick={() => void connect()}
            disabled={!urlValid || duplicate || connecting}
          >
            {connecting ? 'Wird geprüft…' : 'Verbinden'}
          </Button>
        </div>
        <span
          id="hub-wp-hint"
          className={cn(
            'text-xs text-pretty',
            (url && !urlValid) || duplicate || connectError
              ? 'text-red-700 dark:text-red-400'
              : 'text-grey-500'
          )}
        >
          {connectError ??
            (duplicate
              ? 'Diese Website ist bereits im Notebook.'
              : url && !urlValid
                ? WP_ERROR_MESSAGES.invalid_url
                : 'Öffentliche Beiträge und Seiten werden importiert; mit „Synchronisieren" kommen neue dazu.')}
        </span>
      </div>

      {groups.length === 0 ? (
        <EmptySources
          icon={<HiGlobeAlt aria-hidden className="size-5" />}
          title="Noch keine Website"
          text="Gib oben die Adresse einer WordPress-Website ein."
        />
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-lg border border-grey-200 p-0 text-sm dark:border-grey-700">
          {groups.map((group, idx) => {
            const website = websiteOf(group.site.websiteId);
            const isSyncing = syncing === group.site.websiteId;
            return (
              <li
                key={group.site.websiteId}
                className={cn(idx > 0 && 'border-t border-grey-200 dark:border-grey-700')}
              >
                <button
                  type="button"
                  onClick={() => setSheet({ mode: 'detail', websiteId: group.site.websiteId })}
                  className="flex w-full items-center gap-sm px-md py-[0.8125rem] text-left hover:bg-secondary-600/6"
                >
                  <span
                    aria-hidden
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-background-alt text-secondary-600"
                  >
                    <HiGlobeAlt className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{website?.siteName ?? 'Unbekannte Website'}</span>
                    <span className="truncate text-xs text-grey-500">
                      {group.documents.length} Beiträge · {selectionSummary(group.site)} ·{' '}
                      {isSyncing
                        ? 'Synchronisiere…'
                        : group.site.lastSyncedAt
                          ? `Sync ${formatRelativeTime(group.site.lastSyncedAt)}`
                          : 'Noch nicht synchronisiert'}
                    </span>
                  </span>
                  <StatusDot status={isSyncing ? 'indexing' : 'ready'} />
                  <HiChevronRight aria-hidden className="size-4 text-grey-400" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent
          side="right"
          className="w-[min(26.25rem,100vw)] max-w-[100vw] gap-md overflow-y-auto p-lg"
        >
          <SheetHeader className="p-0 pr-lg">
            <SheetTitle>{sheetTitle}</SheetTitle>
            <SheetDescription>
              {sheet?.mode === 'select' ? 'Auswahl für den Import' : 'WordPress-Website'}
            </SheetDescription>
          </SheetHeader>

          {sheet?.mode === 'select' ? (
            <WordpressSelection
              key={sheet.websiteId}
              websiteId={sheet.websiteId}
              siteUrl={sheet.siteUrl}
              editing={selected?.site ?? null}
              room={room}
              onCancel={() =>
                setSheet(selected ? { mode: 'detail', websiteId: sheet.websiteId } : null)
              }
              onImported={async (outcome) => {
                await persist(outcome, selected?.site ?? null);
                setSheet({ mode: 'detail', websiteId: sheet.websiteId });
              }}
            />
          ) : selected ? (
            <>
              <dl className="m-0 flex flex-col gap-xs text-sm">
                {[
                  ['Adresse', selectedWebsite?.siteUrl.replace(/^https?:\/\//, '') ?? '—'],
                  ['Auswahl', selectionSummary(selected.site)],
                  ['Beiträge', String(selected.documents.length)],
                  [
                    'Letzter Sync',
                    selected.site.lastSyncedAt
                      ? formatRelativeTime(selected.site.lastSyncedAt)
                      : 'nie',
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-sm">
                    <dt className="shrink-0 text-grey-500">{k}</dt>
                    <dd className="m-0 min-w-0 truncate text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              {selected.documents.length > 0 ? (
                <div className="flex flex-col gap-xs">
                  <span className="text-xs font-semibold tracking-wide text-grey-500 uppercase">
                    Neueste Beiträge
                  </span>
                  {selected.documents.slice(0, 3).map((d) => (
                    <span key={d.id} className="flex items-center gap-xs text-[13px]">
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full bg-secondary-600"
                      />
                      <span className="truncate">{d.title}</span>
                    </span>
                  ))}
                  {selected.documents.length > 3 ? (
                    <span className="text-xs text-grey-500">
                      + {selected.documents.length - 3} weitere
                    </span>
                  ) : null}
                </div>
              ) : null}
              <Separator />
              <div className="flex flex-col gap-xs">
                <Button
                  size="sm"
                  disabled={syncing !== null}
                  onClick={() => void sync(selected.site)}
                >
                  {syncing === selected.site.websiteId
                    ? 'Synchronisiere…'
                    : 'Jetzt synchronisieren'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedWebsite}
                  onClick={() =>
                    selectedWebsite &&
                    setSheet({
                      mode: 'select',
                      websiteId: selectedWebsite.id,
                      siteUrl: selectedWebsite.siteUrl,
                      name: selectedWebsite.siteName,
                    })
                  }
                >
                  Auswahl ändern
                </Button>
                {selectedWebsite ? (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={selectedWebsite.siteUrl} target="_blank" rel="noopener noreferrer">
                      Website öffnen ↗
                    </a>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-700 dark:text-red-400"
                  onClick={() => void disconnect(selected)}
                >
                  Verbindung trennen
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
