import { profilbildStickersToAssetInstances } from '@gruenerator/canvas-editor/profilbildStickers';
import { getContractsClient } from '@gruenerator/shared/api';
import { DEFAULT_CANVAS_SIZE } from '@gruenerator/shared/canvas-editor';
import {
  parseProfilbildCatalogParams,
  parseSavedProfilbild,
  PROFILBILD_SIZE,
} from '@gruenerator/shared/profilbild';
import { galleryTarget } from '@gruenerator/shared/stickers';
import { Alert, AlertDescription, Button, UploadZone } from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PiUserFill } from 'react-icons/pi';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { seedCanvasQuery } from '../../image-studio/canvasQuery';
import {
  ProfilbildEditor,
  type ProfilbildCanvasHandoff,
  type ProfilbildReopen,
} from '../components/ProfilbildEditor';
import { RecentProfilbilder } from '../components/RecentProfilbilder';
import { IMAGE_ACCEPT, ToolBackLink, ToolProcessing, ToolSpinner } from '../components/ToolUi';
import { BACKGROUND_REMOVAL_ERROR, useBackgroundRemoval } from '../hooks/useBackgroundRemoval';
import { loadShareFileDataUrl } from '../hooks/useProfilbildShare';
import { mintProfilbildCanvas, type ProfilbildLayout } from '../profilbildCanvas';
import { hasProfilbildHandoffMarker, takeProfilbildHandoff } from '../profilbildHandoff';
import { parseProfilbildAssetParams } from '../utils/galleryAsset';

import { cn } from '@/utils/cn';

const TITLE = 'Profilbild';
const DESCRIPTION = 'Freistellen und Hintergrund per Klick wechseln';

const FULL_SHEET: ProfilbildLayout = {
  imagePosition: { x: 0, y: 0 },
  imageSize: { w: PROFILBILD_SIZE, h: PROFILBILD_SIZE },
};

async function loadReopen(
  shareToken: string
): Promise<{ cutoutUrl: string; reopen: ProfilbildReopen }> {
  const res = await getContractsClient().sharesRead.getMyShare({ params: { shareToken } });
  if (res.status !== 200) throw new Error('Profilbild nicht gefunden');
  const saved = parseSavedProfilbild(res.body.share.imageMetadata);
  if (!saved) throw new Error('Kein gespeichertes Profilbild');
  const cutoutUrl = await loadShareFileDataUrl(`/api/share/${shareToken}/original`);
  return { cutoutUrl, reopen: { shareToken, saved } };
}

/** Was die leere Bühne trägt: Upload, Freistellen oder den Fehler davon. */
function PhotoStage({
  backgroundPreview,
  status,
  originalUrl,
  uploadError,
  pendingHint,
  onFile,
  onUploadError,
  onRetry,
  onReset,
}: {
  backgroundPreview: string | null;
  status: ReturnType<typeof useBackgroundRemoval>['status'];
  originalUrl: string | null;
  uploadError: string | null;
  pendingHint: string | null;
  onFile: (file: File) => void;
  onUploadError: (message: string) => void;
  onRetry: () => void;
  onReset: () => void;
}) {
  const overlay =
    'absolute inset-0 flex flex-col items-center justify-center gap-sm p-md text-center';
  if (status === 'processing')
    return (
      <div className={cn(overlay, 'bg-black/25')}>
        {originalUrl ? (
          <img
            src={originalUrl}
            alt=""
            className="absolute inset-0 size-full animate-pulse object-cover opacity-60"
          />
        ) : null}
        <ToolSpinner
          label="Person wird freigestellt …"
          className="relative rounded-full bg-background/90 px-md py-xs text-sm"
        />
      </div>
    );
  if (status === 'error')
    return (
      <div className={cn(overlay, 'bg-background/85 backdrop-blur-sm')}>
        <p role="alert" className="m-0 text-sm text-error">
          {BACKGROUND_REMOVAL_ERROR}
        </p>
        <div className="flex flex-wrap justify-center gap-sm">
          <Button type="button" size="sm" variant="brand" onClick={onRetry}>
            Erneut versuchen
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onReset}>
            Anderes Foto
          </Button>
        </div>
      </div>
    );
  return (
    // Hell statt vollflächig im gewählten Hintergrund: der zeigt sich als runde
    // Vorschau mit Silhouette, wie das fertige Profilbild aussehen wird.
    <div className="absolute inset-0 flex flex-col bg-[color-mix(in_srgb,#46962b_12%,white)] p-sm dark:bg-grey-800">
      <UploadZone
        accept={IMAGE_ACCEPT}
        maxSizeMB={10}
        icon={
          <span
            aria-hidden="true"
            className="flex size-16 items-end justify-center overflow-hidden rounded-full bg-grey-200 bg-cover bg-center dark:bg-grey-700"
            style={backgroundPreview ? { backgroundImage: `url(${backgroundPreview})` } : undefined}
          >
            <PiUserFill className="-mb-1.5 size-14 text-white/90" />
          </span>
        }
        title="Foto hochladen"
        subtitle={pendingHint ?? 'Ziehen oder auswählen – am besten ein Porträt'}
        className="min-h-0 flex-1 border-grey-300/80 bg-transparent px-md py-md"
        onFileSelected={onFile}
        onError={onUploadError}
      />
      {uploadError ? (
        <p
          role="alert"
          className="m-0 mt-xs rounded-md bg-background/90 px-sm py-xs text-sm text-error"
        >
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}

const ProfilbildPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const reopenToken = searchParams.get('share');
  const galleryAsset = useMemo(() => parseProfilbildAssetParams(searchParams), [searchParams]);
  // A catalogue sticker or background from a collection; a gallery item wins over it.
  const catalogPick = useMemo(
    () => (galleryAsset ? null : parseProfilbildCatalogParams(searchParams)),
    [galleryAsset, searchParams]
  );
  const linked = galleryAsset ?? catalogPick;
  const reopened = useQuery({
    queryKey: ['profilbild-reopen', reopenToken],
    queryFn: () => loadReopen(reopenToken ?? ''),
    enabled: !!reopenToken,
    // A refetch would hand the editor a fresh cutout and reset the open work.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const { status, originalUrl, cutoutDataUrl, start, retry, reset } = useBackgroundRemoval({
    downscale: true,
  });
  const [handoffUrl, setHandoffUrl] = useState(() =>
    hasProfilbildHandoffMarker(location.state) ? takeProfilbildHandoff() : null
  );
  const [uploadError, setUploadError] = useState<string | null>(null);

  const cutoutUrl = reopenToken
    ? (reopened.data?.cutoutUrl ?? null)
    : (handoffUrl ?? (status === 'done' ? cutoutDataUrl : null));

  // The deep link waits for a photo; once the editor has it, the hint is done.
  const [pendingAsset, setPendingAsset] = useState(linked);
  const [linkedAssetId, setLinkedAssetId] = useState(linked?.id ?? null);
  if ((linked?.id ?? null) !== linkedAssetId) {
    setLinkedAssetId(linked?.id ?? null);
    setPendingAsset(linked);
  }
  if (cutoutUrl && pendingAsset) setPendingAsset(null);

  const editInCanvas = async (handoff: ProfilbildCanvasHandoff) => {
    if (!cutoutUrl) return;
    // The flattened image fills the square profilbild sheet, so it keeps its pinned 1:1 format.
    const canvas =
      handoff.kind === 'flat'
        ? await mintProfilbildCanvas(handoff.imageDataUrl, 'Profilbild', undefined, FULL_SHEET)
        : await mintProfilbildCanvas(
            handoff.cutoutDataUrl,
            'Profilbild',
            handoff.backgroundColor,
            handoff.layout,
            profilbildStickersToAssetInstances(
              handoff.stickers,
              PROFILBILD_SIZE,
              DEFAULT_CANVAS_SIZE
            )
          );
    seedCanvasQuery(queryClient, canvas);
    void navigate(`/studio/canvas/${canvas.id}`);
  };

  const [session, setSession] = useState(0);
  const startOver = () => {
    setSession((n) => n + 1);
    setHandoffUrl(null);
    reset();
    if (location.state || location.search)
      void navigate(location.pathname, { replace: true, state: null });
  };

  if (reopenToken && (reopened.isPending || reopened.isError))
    return (
      <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
        <header className="flex flex-none items-center gap-2 pt-1.5 pr-4 pb-2.5 pl-14 md:h-[72px] md:border-b md:border-border md:px-6 md:py-0 lg:px-8">
          <ToolBackLink to="/studio" label="Zurück zum Studio" />
          <h1 className="m-0 text-[22px] font-semibold text-foreground-heading md:text-2xl">
            {TITLE}
          </h1>
        </header>
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-md bg-background-alt p-6">
          {reopened.isPending ? (
            <ToolProcessing imageUrl={null} label="Profilbild wird geladen …" />
          ) : (
            <>
              <Alert variant="destructive" role="alert" className="max-w-md">
                <AlertDescription>Dieses Profilbild konnte nicht geöffnet werden.</AlertDescription>
              </Alert>
              <Button type="button" variant="brand" onClick={startOver}>
                Neues Profilbild
              </Button>
            </>
          )}
        </main>
      </div>
    );

  // Der Editor steht von Anfang an da; bis ein Foto drin ist, trägt die Bühne
  // den Upload. Ein neuer Durchgang („Anderes Foto") ist eine neue Sitzung,
  // damit das neue Foto nicht das vorige Profilbild überschreibt.
  return (
    <ProfilbildEditor
      key={`${reopenToken ?? 'new'}-${session}`}
      title={TITLE}
      description={DESCRIPTION}
      beforeStage={!reopenToken && !cutoutUrl ? <RecentProfilbilder /> : null}
      cutoutUrl={cutoutUrl}
      reopen={reopenToken ? (reopened.data?.reopen ?? null) : null}
      galleryAsset={galleryAsset}
      catalogPick={catalogPick}
      onEditInCanvas={editInCanvas}
      onReset={startOver}
      emptyStage={(backgroundPreview) => (
        <PhotoStage
          backgroundPreview={backgroundPreview}
          status={status}
          originalUrl={originalUrl}
          uploadError={uploadError}
          pendingHint={
            pendingAsset
              ? `Lade zuerst ein Foto hoch – dann setzen wir ${galleryTarget(pendingAsset)} ein.`
              : null
          }
          onFile={(file) => {
            setUploadError(null);
            start(file);
          }}
          onUploadError={setUploadError}
          onRetry={retry}
          onReset={reset}
        />
      )}
    />
  );
};

export default ProfilbildPage;
