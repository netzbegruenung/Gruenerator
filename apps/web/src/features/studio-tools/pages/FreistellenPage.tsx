import { Alert, AlertDescription, Button, UploadZone } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';
import { mintCanvasFromImage } from '../../image-studio/bild-editor-v2/canvasHandoff';
import { seedCanvasQuery } from '../../image-studio/canvasQuery';
import { ToolResultCard } from '../components/ToolResultCard';
import { BACKGROUND_REMOVAL_ERROR, useBackgroundRemoval } from '../hooks/useBackgroundRemoval';
import { PROFILBILD_HANDOFF_STATE, setProfilbildHandoff } from '../profilbildHandoff';

const IMAGE_ACCEPT = { 'image/jpeg': [], 'image/png': [], 'image/webp': [] };

const FreistellenPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { status, originalUrl, cutoutDataUrl, start, retry, reset } = useBackgroundRemoval();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const editInCanvas = async () => {
    if (!cutoutDataUrl) return;
    const canvas = await mintCanvasFromImage(cutoutDataUrl, 'Freigestelltes Bild');
    seedCanvasQuery(queryClient, canvas);
    void navigate(`/studio/canvas/${canvas.id}`);
  };

  const goToProfilbild = () => {
    if (!cutoutDataUrl) return;
    setProfilbildHandoff(cutoutDataUrl);
    void navigate('/studio/profilbild', { state: PROFILBILD_HANDOFF_STATE });
  };

  return (
    <PageContainer
      maxWidth="lg"
      title="Hintergrund entfernen"
      subtitle="Person oder Motiv in Sekunden freistellen"
      bgClassName={getToolGradient('freisteller')}
    >
      <div className="flex flex-col gap-md">
        {status === 'idle' ? (
          <>
            <UploadZone
              variant="minimal"
              accept={IMAGE_ACCEPT}
              maxSizeMB={10}
              title="Bild hierher ziehen oder auswählen"
              subtitle="JPG, PNG oder WebP bis 10 MB"
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

        {status === 'processing' ? (
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
              <span>Hintergrund wird entfernt …</span>
            </div>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="flex flex-col gap-md">
            <Alert variant="destructive" role="alert">
              <AlertDescription>{BACKGROUND_REMOVAL_ERROR}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-sm">
              <Button type="button" variant="brand" onClick={retry}>
                Erneut versuchen
              </Button>
              <Button type="button" variant="outline" onClick={reset}>
                Anderes Bild
              </Button>
            </div>
          </div>
        ) : null}

        {status === 'done' && originalUrl && cutoutDataUrl ? (
          <>
            <ToolResultCard
              beforeSrc={originalUrl}
              afterSrc={cutoutDataUrl}
              transparent
              downloadName="freigestellt.png"
              onEditInCanvas={editInCanvas}
            />
            <div className="flex flex-wrap gap-sm">
              <Button type="button" variant="outline" onClick={goToProfilbild}>
                Als Profilbild verwenden
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                Anderes Bild
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </PageContainer>
  );
};

export default FreistellenPage;
