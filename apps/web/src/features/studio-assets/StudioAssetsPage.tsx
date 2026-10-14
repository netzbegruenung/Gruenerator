import {
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetScope,
  type StudioAssetSort,
} from '@gruenerator/contracts';
import {
  STUDIO_ASSET_PLURAL,
  STUDIO_ASSET_SCOPES,
  STUDIO_ASSETS_QUERY_KEY,
  useStudioAssetMutations,
  useStudioAssets,
  useStudioAssetToggles,
} from '@gruenerator/shared/studio-assets';
import { Button, toast } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type JSX } from 'react';
import { HiPlus } from 'react-icons/hi';
import { LuArrowDownUp } from 'react-icons/lu';
import { Link, useNavigate } from 'react-router-dom';

import {
  FilterMenuButton,
  GalleryEmptyState,
  GalleryGrid,
  GallerySkeleton,
} from '../../components/common/Gallery/parts';
import { PageHero, PageHeroSearch, PageShell } from '../../components/common/PageHero';
import { PillTabs, type PillTab } from '../../components/common/PillTabs';
import { ReportDialog } from '../../components/common/ReportDialog';
import { UnderlineTabs, type UnderlineTab } from '../../components/common/UnderlineTabs';
import { profilbildAssetHref } from '../studio-tools/utils/galleryAsset';
import { useTrashUndoToast } from '../trash/trashUndoToast';

import { BackgroundUploadDialog } from './BackgroundUploadDialog';
import { StudioAssetCard, type StudioAssetCardProps } from './StudioAssetCard';
import { PublishDialog, RenameDialog } from './StudioAssetDialogs';

const SEARCH_DEBOUNCE_MS = 400;
const CREATE_PATH = '/studio/sticker/neu';

const KIND_TABS: PillTab<StudioAssetKind>[] = [
  { key: 'sticker', label: 'Sticker' },
  { key: 'background', label: 'Hintergründe' },
];

const SCOPE_TABS: UnderlineTab<StudioAssetScope>[] = STUDIO_ASSET_SCOPES.map((s) => ({
  key: s.value,
  label: s.label,
}));

const SORT_OPTIONS: { id: StudioAssetSort; label: string }[] = [
  { id: 'new', label: 'Neu' },
  { id: 'popular', label: 'Beliebt' },
];

type OpenDialog =
  { type: 'report' | 'publish' | 'rename'; item: StudioAssetItem } | { type: 'upload' } | null;

function emptyState(scope: StudioAssetScope, kind: StudioAssetKind, searching: boolean) {
  const plural = STUDIO_ASSET_PLURAL[kind];
  if (searching) return { title: 'Nichts gefunden', hint: 'Versuche einen anderen Suchbegriff.' };
  if (scope === 'mine')
    return {
      title: `Du hast noch keine ${plural}`,
      hint:
        kind === 'sticker'
          ? 'Erstelle einen Sticker aus einem Foto und nutze ihn im Profilbild.'
          : 'Lade ein eigenes Bild hoch und nutze es als Hintergrund im Profilbild.',
    };
  if (scope === 'saved')
    return {
      title: 'Noch nichts gemerkt',
      hint: `Merke dir ${plural} unter „Entdecken“, um sie hier wiederzufinden.`,
    };
  return {
    title: `Noch keine ${plural} zum Entdecken`,
    hint: 'Erstelle den ersten und teile ihn mit allen.',
  };
}

function CreateButton({
  kind,
  onUpload,
}: {
  kind: StudioAssetKind;
  onUpload: () => void;
}): JSX.Element {
  // The Sticker-Creator only makes stickers; backgrounds are uploaded directly.
  if (kind === 'background')
    return (
      <Button size="sm" onClick={onUpload}>
        <HiPlus aria-hidden /> Hintergrund hochladen
      </Button>
    );
  return (
    <Button asChild size="sm">
      <Link to={CREATE_PATH}>
        <HiPlus aria-hidden /> Sticker erstellen
      </Link>
    </Button>
  );
}

function StudioAssetTile(
  props: Omit<StudioAssetCardProps, 'onToggleLike' | 'onToggleFavorite'>
): JSX.Element {
  const { toggleLike, toggleFavorite } = useStudioAssetToggles(props.item.id);
  return <StudioAssetCard {...props} onToggleLike={toggleLike} onToggleFavorite={toggleFavorite} />;
}

const StudioAssetsPage = (): JSX.Element => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showTrashUndo = useTrashUndoToast();
  const [kind, setKind] = useState<StudioAssetKind>('sticker');
  const [scope, setScope] = useState<StudioAssetScope>('shop');
  const [sort, setSort] = useState<StudioAssetSort>('new');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<OpenDialog>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Only Entdecken has a popularity order; own and saved lists are newest first.
  const effectiveSort = scope === 'shop' ? sort : 'new';
  const {
    items,
    isLoading,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    refetch,
    error,
  } = useStudioAssets({ kind, scope, q, sort: effectiveSort });
  const { update, remove } = useStudioAssetMutations();
  const { mutate: updateAsset } = update;
  const { mutate: removeAsset } = remove;

  const close = useCallback(() => setDialog(null), []);
  const openUpload = useCallback(() => setDialog({ type: 'upload' }), []);
  const handleUse = useCallback(
    (item: StudioAssetItem) => void navigate(profilbildAssetHref(item)),
    [navigate]
  );
  const handleReport = useCallback(
    (item: StudioAssetItem) => setDialog({ type: 'report', item }),
    []
  );
  const handlePublish = useCallback(
    (item: StudioAssetItem) => setDialog({ type: 'publish', item }),
    []
  );
  const handleRename = useCallback(
    (item: StudioAssetItem) => setDialog({ type: 'rename', item }),
    []
  );
  const handleMakePrivate = useCallback(
    (item: StudioAssetItem) =>
      updateAsset(
        { id: item.id, body: { visibility: 'private' } },
        { onSuccess: () => toast.success(`„${item.title}“ ist jetzt privat.`) }
      ),
    [updateAsset]
  );
  const handleDelete = useCallback(
    (item: StudioAssetItem) =>
      removeAsset(item.id, {
        onSuccess: () => showTrashUndo({ kind: 'studio_asset', id: item.id, title: item.title }),
      }),
    [removeAsset, showTrashUndo]
  );

  const empty = emptyState(scope, kind, q !== '');
  const createButton = <CreateButton kind={kind} onUpload={openUpload} />;

  return (
    <PageShell wide>
      <PageHero
        title="Sticker & Hintergründe"
        description={
          <p className="m-0 text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
            Entdecke Sticker und Hintergründe für dein Profilbild, merke dir deine Favoriten und
            teile eigene.
          </p>
        }
        toolbar={
          <>
            <PageHeroSearch
              query={searchInput}
              onQuery={setSearchInput}
              placeholder={
                kind === 'sticker' ? 'Sticker durchsuchen…' : 'Hintergründe durchsuchen…'
              }
            />
            {scope === 'shop' && (
              <FilterMenuButton
                label={sort === 'popular' ? 'Sortierung: Beliebt' : 'Sortierung'}
                menuLabel="Sortieren"
                value={sort}
                options={SORT_OPTIONS}
                onChange={(value) => setSort(value as StudioAssetSort)}
                active={sort !== 'new'}
                icon={<LuArrowDownUp aria-hidden className="size-[18px]" />}
              />
            )}
          </>
        }
        actions={createButton}
        meta={
          <PillTabs
            tabs={KIND_TABS}
            active={kind}
            onSelect={setKind}
            ariaLabel="Art"
            className="justify-start"
          />
        }
      />

      <UnderlineTabs tabs={SCOPE_TABS} value={scope} onChange={setScope} />

      <h2 className="sr-only">
        {SCOPE_TABS.find((t) => t.key === scope)?.label}:{' '}
        {kind === 'sticker' ? 'Sticker' : 'Hintergründe'}
      </h2>
      {error && items.length === 0 ? (
        <p className="text-center text-error">{error.message}</p>
      ) : (
        <>
          <GalleryGrid size="small">
            {isLoading ? (
              <GallerySkeleton className="aspect-[4/5]" />
            ) : (
              items.map((item) => (
                <StudioAssetTile
                  key={item.id}
                  item={item}
                  onUseInProfilbild={handleUse}
                  onReport={handleReport}
                  onPublish={handlePublish}
                  onMakePrivate={handleMakePrivate}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              ))
            )}
            {isFetchingNextPage && <GallerySkeleton count={4} className="aspect-[4/5]" />}
          </GalleryGrid>

          {!isLoading && items.length === 0 && (
            <GalleryEmptyState {...empty} action={createButton} />
          )}

          {error ? (
            <div className="flex flex-col items-center gap-xs">
              <p role="alert" className="m-0 text-center text-sm text-error">
                {error.message}
              </p>
              <Button
                variant="outline"
                onClick={() => void (isFetchNextPageError ? fetchNextPage() : refetch())}
                disabled={isFetchingNextPage}
              >
                Erneut versuchen
              </Button>
            </div>
          ) : (
            hasNextPage && (
              <Button
                variant="outline"
                className="self-center"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Lädt …' : 'Mehr laden'}
              </Button>
            )
          )}
        </>
      )}

      {dialog?.type === 'upload' && <BackgroundUploadDialog onClose={close} />}
      {dialog?.type === 'report' && (
        <ReportDialog
          open
          onOpenChange={(open) => !open && close()}
          kind="studio_asset"
          targetId={dialog.item.id}
          title={dialog.item.title}
          onReported={() =>
            void queryClient.invalidateQueries({ queryKey: STUDIO_ASSETS_QUERY_KEY })
          }
        />
      )}
      {dialog?.type === 'publish' && (
        <PublishDialog
          item={dialog.item}
          busy={update.isPending}
          onClose={close}
          onConfirm={() =>
            update.mutate(
              { id: dialog.item.id, body: { visibility: 'public', rightsConfirmed: true } },
              {
                onSuccess: () => {
                  toast.success(`„${dialog.item.title}“ ist jetzt öffentlich.`);
                  close();
                },
              }
            )
          }
        />
      )}
      {dialog?.type === 'rename' && (
        <RenameDialog
          item={dialog.item}
          busy={update.isPending}
          onClose={close}
          onSave={(title) =>
            update.mutate({ id: dialog.item.id, body: { title } }, { onSuccess: close })
          }
        />
      )}
    </PageShell>
  );
};

export default StudioAssetsPage;
