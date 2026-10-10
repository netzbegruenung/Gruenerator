import { Alert, AlertDescription, Button, UploadZone } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';
import { seedCanvasQuery } from '../../image-studio/canvasQuery';
import { ProfilbildEditor } from '../components/ProfilbildEditor';
import { BACKGROUND_REMOVAL_ERROR, useBackgroundRemoval } from '../hooks/useBackgroundRemoval';
import { mintProfilbildCanvas, type ProfilbildLayout } from '../profilbildCanvas';
import { hasProfilbildHandoffMarker, takeProfilbildHandoff } from '../profilbildHandoff';

const IMAGE_ACCEPT = { 'image/jpeg': [], 'image/png': [], 'image/webp': [] };

const ProfilbildPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { status, originalUrl, cutoutDataUrl, start, retry, reset } = useBackgroundRemoval({
    downscale: true,
  });
  const [handoffUrl, setHandoffUrl] = useState(() =>
    hasProfilbildHandoffMarker(location.state) ? takeProfilbildHandoff() : null
  );
  const [uploadError, setUploadError] = useState<string | null>(null);

  const cutoutUrl = handoffUrl ?? (status === 'done' ? cutoutDataUrl : null);

  const editInCanvas = async (
    backgroundColor: string | null,
    layout: ProfilbildLayout,
    transparentDataUrl: string
  ) => {
    if (!cutoutUrl) return;
    const canvas = await mintProfilbildCanvas(
      transparentDataUrl,
      'Profilbild',
      backgroundColor ?? undefined,
      layout
    );
    seedCanvasQuery(queryClient, canvas);
    void navigate(`/studio/canvas/${canvas.id}`);
  };

  const startOver = () => {
    setHandoffUrl(null);
    reset();
    if (location.state) void navigate(location.pathname, { replace: true, state: null });
  };

  return (
    <PageContainer
      maxWidth="lg"
      title="Profilbild"
      subtitle="Freistellen und Hintergrund per Klick wechseln"
      bgClassName={getToolGradient('profilbild')}
    >
      <div className="flex flex-col gap-md">
        {cutoutUrl ? (
          <ProfilbildEditor
            cutoutUrl={cutoutUrl}
            onEditInCanvas={editInCanvas}
            onReset={startOver}
          />
        ) : null}

        {!cutoutUrl && status === 'idle' ? (
          <>
            <UploadZone
              variant="minimal"
              accept={IMAGE_ACCEPT}
              maxSizeMB={10}
              title="Foto hierher ziehen oder auswählen"
              subtitle="Am besten ein Porträt – JPG, PNG oder WebP bis 10 MB"
              onFileSelected={(file: File) => {
                setUploadError(null);
                start(file);
              }}
              onError={(msg: string) => setUploadError(msg)}
            />
            {uploadError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : null}

        {!cutoutUrl && status === 'processing' ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-md rounded-[14px] border border-grey-200 bg-background p-lg dark:border-grey-700"
          >
            {originalUrl ? (
              <img src={originalUrl} alt="" className="max-h-[240px] rounded-[10px] opacity-60" />
            ) : null}
            <div className="flex items-center gap-sm">
              <span
                aria-hidden="true"
                className="size-5 animate-spin rounded-full border-2 border-grey-300 border-t-primary-600"
              />
              <span>Person wird freigestellt …</span>
            </div>
          </div>
        ) : null}

        {!cutoutUrl && status === 'error' ? (
          <div className="flex flex-col gap-md">
            <Alert variant="destructive" role="alert">
              <AlertDescription>{BACKGROUND_REMOVAL_ERROR}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-sm">
              <Button type="button" variant="brand" onClick={retry}>
                Erneut versuchen
              </Button>
              <Button type="button" variant="outline" onClick={reset}>
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
