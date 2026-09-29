import { type NotebookDocumentRecord, type TransformedCollection } from '@gruenerator/contracts';
import { DocsProvider } from '@gruenerator/docs';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  toast,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { HiCloud, HiDocumentText, HiDotsHorizontal, HiGlobeAlt, HiUpload } from 'react-icons/hi';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { PillTabs, type PillTab } from '../../../../components/common/PillTabs';
import ErrorBoundary from '../../../../components/ErrorBoundary';
import { useAuthStore } from '../../../../stores/authStore';
import { webAppDocsAdapter } from '../../../docs/docsAdapter';
import { ResearchDocumentReader } from '../../manual-search/ResearchDocumentReader';
import { NotebookFullSyncModal } from '../NotebookFullSyncModal';
import { NotebookShareModal } from '../NotebookShareModal';

import { DocsPanel } from './DocsPanel';
import { HubHero } from './HubHero';
import { isHubTab, partitionSources, tabCount, type HubTab } from './hubSources';
import { UploadPanel } from './UploadPanel';
import { useNotebookHub } from './useNotebookHub';
import { WolkePanel } from './WolkePanel';
import { WordpressPanel } from './WordpressPanel';

const TAB_META: Record<HubTab, Omit<PillTab<HubTab>, 'key'>> = {
  upload: { label: 'Upload', icon: HiUpload },
  wolke: { label: 'Wolke', icon: HiCloud },
  docs: { label: 'Docs', icon: HiDocumentText },
  wordpress: { label: 'WordPress', icon: HiGlobeAlt },
};

function notebookPath(c: Pick<TransformedCollection, 'id' | 'name' | 'slug_suffix'>) {
  return `/notebooks/${c.slug_suffix ? buildNotebookSlug(c.name, c.slug_suffix) : c.id}`;
}

/**
 * Das Server-Recht ist die Wahrheit (403 bei jedem Schreibvorgang). Der Client
 * kennt die Gruppenrollen nicht; bei `group_admins` sieht ein einfaches
 * Mitglied die Bedienelemente also, bekommt beim Speichern aber die 403.
 */
function mayEdit(c: TransformedCollection, userId: string | null): boolean {
  if (userId !== null && c.user_id === userId) return true;
  return c.share_mode === 'groups' && (c.edit_policy ?? 'owner_only') !== 'owner_only';
}

export function NotebookHub({ slugOrId, isNew }: { slugOrId: string; isNew: boolean }) {
  const hub = useNotebookHub(slugOrId);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [shareOpen, setShareOpen] = useState(false);
  const [fullSyncOpen, setFullSyncOpen] = useState(false);
  const [preview, setPreview] = useState<Pick<NotebookDocumentRecord, 'id' | 'title'> | null>(null);
  // Nur beim ersten Rendern: danach soll ein Reload nicht wieder ins Feld springen.
  const [startEditingTitle] = useState(isNew);

  const collection = hub.collection;
  const sources = useMemo(() => (collection ? partitionSources(collection) : null), [collection]);

  if (hub.query.isPending) {
    return (
      <div className="mx-auto mt-2xl h-40 w-full max-w-[65rem] animate-pulse rounded-xl bg-grey-100 dark:bg-grey-900" />
    );
  }

  if (!collection || !sources) {
    const error = hub.query.data?.error;
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            {error === 'forbidden' ? 'Kein Zugriff' : 'Notebook nicht gefunden'}
          </EmptyTitle>
          <EmptyDescription>
            {error === 'forbidden'
              ? 'Dieses Notebook ist nicht mit dir geteilt.'
              : 'Dieses Notebook existiert nicht oder wurde gelöscht.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => void navigate('/wissen')}>Zu meinen Notebooks</Button>
        </EmptyContent>
      </Empty>
    );
  }

  const isOwner = currentUserId !== null && collection.user_id === currentUserId;
  const canEdit = mayEdit(collection, currentUserId);
  const tabParam = params.get('tab');
  const tab: HubTab = isHubTab(tabParam) ? tabParam : 'upload';
  const selectTab = (next: HubTab) =>
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set('tab', next);
        out.delete('neu');
        return out;
      },
      { replace: true }
    );

  const report = (err: unknown) => {
    toast.error(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
  };

  const openPreview = (doc: NotebookDocumentRecord) => setPreview({ id: doc.id, title: doc.title });

  const removeDocs = (ids: string[]) => hub.removeDocuments(ids).catch(report);
  const reindexDocs = (ids: string[]) =>
    hub
      .reindex(ids)
      .then(({ queued, messages }) => {
        if (queued > 0)
          toast.success(
            queued === 1 ? 'Wird neu indexiert.' : `${queued} Quellen werden neu indexiert.`
          );
        messages.forEach((m) => toast.error(m));
      })
      .catch(report);

  const hasSyncableSources =
    (collection.wolke_folders?.length ?? 0) > 0 || (collection.linked_docs?.length ?? 0) > 0;

  return (
    <div className="flex w-full justify-center px-[clamp(1rem,4vw,2.5rem)] pt-[clamp(1rem,4vw,2rem)] pb-14">
      <div className="flex w-full max-w-[65rem] flex-col gap-lg">
        <div className="flex items-center justify-end gap-xs">
          <Button variant="ghost" size="sm" asChild>
            <Link to={notebookPath(collection)}>Zum Notebook</Link>
          </Button>
          {isOwner ? (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              Teilen
            </Button>
          ) : null}
          {isOwner && hasSyncableSources ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Weitere Aktionen">
                  <HiDotsHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setFullSyncOpen(true)}>
                  Alle Quellen aktualisieren
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <HubHero
          collection={collection}
          total={sources.total}
          canEdit={canEdit}
          startEditingTitle={startEditingTitle}
          onSave={(patch) => void hub.saveMeta(patch).catch(report)}
        />

        <PillTabs
          ariaLabel="Quellen"
          active={tab}
          onSelect={selectTab}
          className="pb-xs"
          tabs={(Object.keys(TAB_META) as HubTab[]).map((key) => {
            const count = tabCount(sources, key);
            return {
              key,
              ...TAB_META[key],
              suffix:
                key === 'wordpress' ? (
                  <Badge variant="outline" className="border-current text-[10px] opacity-80">
                    Beta
                  </Badge>
                ) : count > 0 ? (
                  <span className="text-sm font-normal opacity-80">{count}</span>
                ) : undefined,
            };
          })}
        />

        <div role="tabpanel" aria-label={TAB_META[tab].label}>
          {!canEdit ? (
            <p className="m-0 mb-sm text-sm text-grey-500">
              Du kannst die Quellen dieses Notebooks ansehen, aber nicht ändern.
            </p>
          ) : null}
          {tab === 'upload' ? (
            <UploadPanel
              hub={hub}
              rows={sources.upload}
              total={sources.total}
              onPreview={openPreview}
              onRemove={removeDocs}
              onReindex={reindexDocs}
            />
          ) : tab === 'wolke' ? (
            <WolkePanel
              hub={hub}
              collectionId={collection.id}
              groups={sources.wolke}
              folders={collection.wolke_folders ?? []}
              autoSync={collection.auto_sync}
              isOwner={isOwner}
              onPreview={openPreview}
            />
          ) : tab === 'docs' ? (
            <DocsPanel
              hub={hub}
              rows={sources.docs}
              linkedDocs={collection.linked_docs ?? []}
              total={sources.total}
              onPreview={openPreview}
            />
          ) : (
            <WordpressPanel hub={hub} groups={sources.wordpress} total={sources.total} />
          )}
        </div>
      </div>

      {isOwner ? (
        <NotebookShareModal
          notebookId={collection.id}
          shareUrl={`${window.location.origin}${notebookPath(collection)}`}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      ) : null}
      {fullSyncOpen ? (
        <NotebookFullSyncModal
          collection={collection}
          open={fullSyncOpen}
          onOpenChange={setFullSyncOpen}
        />
      ) : null}
      {preview ? (
        <ResearchDocumentReader
          key={preview.id}
          target={{
            documentId: preview.id,
            notebookId: collection.id,
            query: '',
            title: preview.title,
          }}
          backLabel="Quellen"
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}

export function NotebookHubShell({ slugOrId, isNew }: { slugOrId: string; isNew: boolean }) {
  return (
    <ErrorBoundary>
      <DocsProvider adapter={webAppDocsAdapter}>
        <NotebookHub slugOrId={slugOrId} isNew={isNew} />
      </DocsProvider>
    </ErrorBoundary>
  );
}
