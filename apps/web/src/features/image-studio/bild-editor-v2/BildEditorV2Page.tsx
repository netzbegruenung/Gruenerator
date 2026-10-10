import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, SquareDashedMousePointer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '../../../utils/cn';
import { seedCanvasQuery } from '../canvasQuery';
import { DownloadButton, OpenInEditorButton } from '../editor-shell/StudioEditorActions';
import { StudioEditorShell } from '../editor-shell/StudioEditorShell';
import { StudioPreviewStage } from '../editor-shell/StudioPreviewStage';

import { BevBoxBar, BevBoxOverlay } from './BevBoxes';
import { BevChat } from './BevChat';
import { BevVersionStrip } from './BevVersionStrip';
import { mintCanvasFromImage } from './canvasHandoff';
import { useBildEditorV2 } from './useBildEditorV2';

export default function BildEditorV2Page() {
  const bev = useBildEditorV2();
  const { active, versions, generating, handedOver, restoring, download, resetAll } = bev;
  const { expert, boxesLoading, toggleExpert } = bev;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // The Studio is where an image begins: without a request and without versions there is
  // nothing to edit here.
  const empty = !handedOver && !restoring && versions.length === 0;
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

  if (empty || (restoring && !handedOver)) return null;

  return (
    <StudioEditorShell
      title="KI-Bild"
      idPrefix="bild"
      // Turning the expert mode on brings the preview up on mobile, where the boxes are.
      revealKey={active ? `${active.id}${expert ? ':boxen' : ''}` : null}
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
            <button
              type="button"
              onClick={toggleExpert}
              aria-pressed={expert}
              aria-label="Expertenmodus"
              title="Elemente des Bildes als Boxen bearbeiten"
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-full border text-[13px] font-bold transition-colors max-md:size-11 md:max-lg:w-9 lg:px-3.5',
                expert
                  ? 'border-white bg-white/25 text-white'
                  : 'border-white/50 text-white hover:bg-white/15'
              )}
            >
              <SquareDashedMousePointer className="size-4" aria-hidden="true" />
              <span className="max-lg:hidden">Expertenmodus</span>
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
          busy={generating || (expert && boxesLoading)}
          // The Studio's default when the text names no format.
          aspect={4 / 5}
          error={openError}
          overlay={expert && <BevBoxOverlay bev={bev} />}
          footer={
            <>
              {expert && active && <BevBoxBar bev={bev} />}
              <BevVersionStrip bev={bev} />
            </>
          }
        />
      }
    />
  );
}
