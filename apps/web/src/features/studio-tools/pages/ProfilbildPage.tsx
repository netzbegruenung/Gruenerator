import { Alert, AlertDescription, Button } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PiUserCircle } from 'react-icons/pi';
import { useLocation, useNavigate } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';
import { mintCanvasFromImage } from '../../image-studio/bild-editor-v2/canvasHandoff';
import { seedCanvasQuery } from '../../image-studio/canvasQuery';
import { ProfilbildEditor, type ProfilbildCanvasHandoff } from '../components/ProfilbildEditor';
import { ToolProcessing, ToolUpload } from '../components/ToolUi';
import { BACKGROUND_REMOVAL_ERROR, useBackgroundRemoval } from '../hooks/useBackgroundRemoval';
import { mintProfilbildCanvas } from '../profilbildCanvas';
import { hasProfilbildHandoffMarker, takeProfilbildHandoff } from '../profilbildHandoff';

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

  const editInCanvas = async (handoff: ProfilbildCanvasHandoff) => {
    if (!cutoutUrl) return;
    const canvas =
      handoff.kind === 'flat'
        ? await mintCanvasFromImage(handoff.imageDataUrl, 'Profilbild')
        : await mintProfilbildCanvas(
            handoff.cutoutDataUrl,
            'Profilbild',
            handoff.backgroundColor,
            handoff.layout
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
      maxWidth="md"
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

        {!cutoutUrl && status === 'processing' ? (
          <ToolProcessing imageUrl={originalUrl} label="Person wird freigestellt …" />
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
