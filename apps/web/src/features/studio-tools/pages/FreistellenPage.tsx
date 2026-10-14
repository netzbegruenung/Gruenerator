import { Alert, AlertDescription, Button } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PiScissors } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';
import { mintCanvasFromImage } from '../../image-studio/bild-editor-v2/canvasHandoff';
import { seedCanvasQuery } from '../../image-studio/canvasQuery';
import { ToolResultCard } from '../components/ToolResultCard';
import { ToolProcessing, ToolUpload } from '../components/ToolUi';
import { BACKGROUND_REMOVAL_ERROR, useBackgroundRemoval } from '../hooks/useBackgroundRemoval';
import { PROFILBILD_HANDOFF_STATE, setProfilbildHandoff } from '../profilbildHandoff';

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
      maxWidth="md"
      title="Hintergrund entfernen"
      subtitle="Person oder Motiv in Sekunden freistellen"
      bgClassName={getToolGradient('freisteller')}
    >
      <div className="flex flex-col gap-md">
        {status === 'idle' ? (
          <ToolUpload
            icon={<PiScissors aria-hidden="true" className="size-7" />}
            title="Bild hierher ziehen oder auswählen"
            subtitle="JPG, PNG oder WebP bis 10 MB"
            error={uploadError}
            onFile={(file) => {
              setUploadError(null);
              start(file);
            }}
            onError={setUploadError}
          />
        ) : null}

        {status === 'processing' ? (
          <ToolProcessing imageUrl={originalUrl} label="Hintergrund wird entfernt …" />
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
              <Button type="button" variant="ghost" onClick={reset}>
                Anderes Bild
              </Button>
            </div>
          </div>
        ) : null}

        {status === 'done' && originalUrl && cutoutDataUrl ? (
          <ToolResultCard
            beforeSrc={originalUrl}
            afterSrc={cutoutDataUrl}
            transparent
            downloadName="freigestellt.png"
            onEditInCanvas={editInCanvas}
            extraActions={
              <>
                <Button type="button" variant="outline" onClick={goToProfilbild}>
                  Als Profilbild verwenden
                </Button>
                <Button type="button" variant="ghost" className="sm:ml-auto" onClick={reset}>
                  Anderes Bild
                </Button>
              </>
            }
          />
        ) : null}
      </div>
    </PageContainer>
  );
};

export default FreistellenPage;
