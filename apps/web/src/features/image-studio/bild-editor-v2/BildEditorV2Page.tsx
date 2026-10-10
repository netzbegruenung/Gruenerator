import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { seedCanvasQuery } from '../canvasQuery';
import { DownloadButton, OpenInEditorButton } from '../editor-shell/StudioEditorActions';
import { StudioEditorShell } from '../editor-shell/StudioEditorShell';
import { StudioPreviewStage } from '../editor-shell/StudioPreviewStage';

import { BevChat } from './BevChat';
import { BevVersionStrip } from './BevVersionStrip';
import { mintCanvasFromImage } from './canvasHandoff';
import { useBildEditorV2 } from './useBildEditorV2';

export default function BildEditorV2Page() {
  const bev = useBildEditorV2();
  const { active, versions, generating, handedOver, download, resetAll } = bev;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // The Studio is where an image begins: without a request and without versions there is
  // nothing to edit here.
  const empty = !handedOver && versions.length === 0;
  useEffect(() => {
    if (empty) void navigate('/studio', { replace: true });
  }, [empty, navigate]);

  const openInCanvas = async () => {
    if (!active) return;
    setOpening(true);
    setOpenError(null);
    try {
      const canvas = await mintCanvasFromImage(active.image, `Bild-Editor · V${active.num}`);
      seedCanvasQuery(queryClient, canvas);
      void navigate(`/studio/canvas/${canvas.id}`);
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : 'Canvas konnte nicht geöffnet werden.');
      setOpening(false);
    }
  };

  if (empty) return null;

  return (
    <StudioEditorShell
      title="KI-Bild"
      idPrefix="bild"
      revealKey={active?.id ?? null}
      actions={
        active && (
          <>
            <button
              type="button"
              onClick={resetAll}
              aria-label="Neu starten"
              title="Neu starten"
              className="flex size-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white max-md:size-11"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
            </button>
            <DownloadButton onClick={download} disabled={generating} exporting={false} />
            <OpenInEditorButton
              onClick={() => void openInCanvas()}
              disabled={generating}
              opening={opening}
            />
          </>
        )
      }
      chat={<BevChat bev={bev} />}
      preview={
        <StudioPreviewStage
          images={active ? [active.image] : []}
          alt="Aktuelle Version"
          busy={generating}
          aspect={1}
          error={openError}
          footer={<BevVersionStrip bev={bev} />}
        />
      }
    />
  );
}
