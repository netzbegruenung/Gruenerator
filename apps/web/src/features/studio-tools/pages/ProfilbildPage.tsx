import { profilbildStickersToAssetInstances } from '@gruenerator/canvas-editor/profilbildStickers';
import { getContractsClient } from '@gruenerator/shared/api';
import { DEFAULT_CANVAS_SIZE } from '@gruenerator/shared/canvas-editor';
import { parseSavedProfilbild, PROFILBILD_SIZE } from '@gruenerator/shared/profilbild';
import { galleryTarget } from '@gruenerator/shared/stickers';
import { Alert, AlertDescription, Button, UploadZone } from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PiUserCircle } from 'react-icons/pi';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';
import { seedCanvasQuery } from '../../image-studio/canvasQuery';
import {
  ProfilbildEditor,
  type ProfilbildCanvasHandoff,
  type ProfilbildReopen,
} from '../components/ProfilbildEditor';
import { IMAGE_ACCEPT, ToolProcessing, ToolSpinner } from '../components/ToolUi';
import { BACKGROUND_REMOVAL_ERROR, useBackgroundRemoval } from '../hooks/useBackgroundRemoval';
import { loadShareFileDataUrl } from '../hooks/useProfilbildShare';
import { mintProfilbildCanvas, type ProfilbildLayout } from '../profilbildCanvas';
import { hasProfilbildHandoffMarker, takeProfilbildHandoff } from '../profilbildHandoff';
import { parseProfilbildAssetParams } from '../utils/galleryAsset';

import { cn } from '@/utils/cn';

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
  status,
  originalUrl,
  uploadError,
  pendingHint,
  onFile,
  onUploadError,
  onRetry,
  onReset,
}: {
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
    <div className="absolute inset-0 flex flex-col p-md">
      <UploadZone
        accept={IMAGE_ACCEPT}
        maxSizeMB={10}
        icon={<PiUserCircle aria-hidden="true" className="size-7" />}
        title="Foto hochladen"
        subtitle={pendingHint ?? 'Ziehen oder auswählen – am besten ein Porträt'}
        className="min-h-0 flex-1 border-white/70 bg-background/80 px-md py-md backdrop-blur-sm"
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
  const [pendingAsset, setPendingAsset] = useState(galleryAsset);
  const [linkedAssetId, setLinkedAssetId] = useState(galleryAsset?.id ?? null);
  if ((galleryAsset?.id ?? null) !== linkedAssetId) {
    setLinkedAssetId(galleryAsset?.id ?? null);
    setPendingAsset(galleryAsset);
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

  return (
    <PageContainer
      maxWidth="md"
      title="Profilbild"
      subtitle="Freistellen und Hintergrund per Klick wechseln"
      bgClassName={getToolGradient('profilbild')}
    >
      <div className="flex flex-col gap-md">
        {reopenToken && reopened.isPending ? (
          <ToolProcessing imageUrl={null} label="Profilbild wird geladen …" />
        ) : reopenToken && reopened.isError ? (
          <div className="flex flex-col gap-md">
            <Alert variant="destructive" role="alert">
              <AlertDescription>Dieses Profilbild konnte nicht geöffnet werden.</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-sm">
              <Button type="button" variant="brand" onClick={startOver}>
                Neues Profilbild
              </Button>
            </div>
          </div>
        ) : (
          // Der Editor steht von Anfang an da; bis ein Foto drin ist, trägt die
          // Bühne den Upload. Ein neuer Durchgang („Anderes Foto") ist eine neue
          // Sitzung, damit das neue Foto nicht das vorige Profilbild überschreibt.
          <ProfilbildEditor
            key={`${reopenToken ?? 'new'}-${session}`}
            cutoutUrl={cutoutUrl}
            reopen={reopenToken ? (reopened.data?.reopen ?? null) : null}
            galleryAsset={galleryAsset}
            onEditInCanvas={editInCanvas}
            onReset={startOver}
            emptyStage={
              <PhotoStage
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
            }
          />
        )}
      </div>
    </PageContainer>
  );
};

export default ProfilbildPage;
