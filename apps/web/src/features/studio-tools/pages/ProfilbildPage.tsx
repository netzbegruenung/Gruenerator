import { profilbildStickersToAssetInstances } from '@gruenerator/canvas-editor/profilbildStickers';
import { getContractsClient } from '@gruenerator/shared/api';
import { DEFAULT_CANVAS_SIZE } from '@gruenerator/shared/canvas-editor';
import { parseSavedProfilbild, PROFILBILD_SIZE } from '@gruenerator/shared/profilbild';
import { Alert, AlertDescription, Button } from '@gruenerator/ui';
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
import { ToolProcessing, ToolUpload } from '../components/ToolUi';
import { BACKGROUND_REMOVAL_ERROR, useBackgroundRemoval } from '../hooks/useBackgroundRemoval';
import { loadShareFileDataUrl } from '../hooks/useProfilbildShare';
import { mintProfilbildCanvas, type ProfilbildLayout } from '../profilbildCanvas';
import { hasProfilbildHandoffMarker, takeProfilbildHandoff } from '../profilbildHandoff';
import { type GalleryAsset, parseProfilbildAssetParams } from '../utils/galleryAsset';

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

const galleryTarget = ({ title, kind }: GalleryAsset) =>
  title ? `„${title}“` : kind === 'sticker' ? 'den Sticker' : 'den Hintergrund';

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

  const startOver = () => {
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
        {cutoutUrl ? (
          <ProfilbildEditor
            key={reopenToken ?? 'new'}
            cutoutUrl={cutoutUrl}
            reopen={reopenToken ? (reopened.data?.reopen ?? null) : null}
            galleryAsset={galleryAsset}
            onEditInCanvas={editInCanvas}
            onReset={startOver}
          />
        ) : null}

        {reopenToken && reopened.isPending ? (
          <ToolProcessing imageUrl={null} label="Profilbild wird geladen …" />
        ) : null}

        {reopenToken && reopened.isError ? (
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
        ) : null}

        {galleryAsset && !reopenToken && !cutoutUrl && status === 'idle' ? (
          <p className="m-0 text-sm">
            {`Lade zuerst ein Foto hoch – dann setzen wir ${galleryTarget(galleryAsset)} ein.`}
          </p>
        ) : null}

        {!reopenToken && !cutoutUrl && status === 'idle' ? (
          <ToolUpload
            icon={<PiUserCircle aria-hidden="true" className="size-7" />}
            title="Foto hierher ziehen oder auswählen"
            subtitle="Am besten ein Porträt – JPG, PNG oder WebP bis 10 MB"
            error={uploadError}
            onFile={(file) => {
              setUploadError(null);
              start(file);
            }}
            onError={setUploadError}
          />
        ) : null}

        {!reopenToken && !cutoutUrl && status === 'processing' ? (
          <ToolProcessing imageUrl={originalUrl} label="Person wird freigestellt …" />
        ) : null}

        {!reopenToken && !cutoutUrl && status === 'error' ? (
          <div className="flex flex-col gap-md">
            <Alert variant="destructive" role="alert">
              <AlertDescription>{BACKGROUND_REMOVAL_ERROR}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-sm">
              <Button type="button" variant="brand" onClick={retry}>
                Erneut versuchen
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                Anderes Foto
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
};

export default ProfilbildPage;
