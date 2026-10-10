import { type KiLabelMode } from '@gruenerator/contracts';
import { IMAGE_FORMAT_IDS, type ImageFormatId } from '@gruenerator/shared/image-studio';
import { Alert, AlertDescription, Button } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { PiArrowsOut } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';
import { mintCanvasFromImage } from '../../image-studio/bild-editor-v2/canvasHandoff';
import { seedCanvasQuery } from '../../image-studio/canvasQuery';
import { outpaintImage } from '../../image-studio/services/imageEditingService';
import { ToolResultCard } from '../components/ToolResultCard';
import {
  TOOL_ACTIONS,
  TOOL_HINT,
  TOOL_LABEL,
  TOOL_PANEL,
  TOOL_PILL,
  ToolSpinner,
  ToolUpload,
} from '../components/ToolUi';
import { fitInTarget, matchesRatio } from '../utils/outpaintPreview';

import { cn } from '@/utils/cn';

const KI_LABEL_OPTIONS: Array<{ id: KiLabelMode; label: string }> = [
  { id: 'full', label: '„KI-Generiert mit dem Grünerator"' },
  { id: 'short', label: 'Nur „KI-Generiert"' },
  { id: 'none', label: 'Keine Kennzeichnung' },
];

const PREVIEW_MAX_HEIGHT = 420;

const HATCH =
  'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-grey-400) 45%, transparent) 0 2px, transparent 2px 10px)';

type Phase = 'preview' | 'processing' | 'error' | 'done';

const UNREADABLE_MESSAGE = 'Dieses Bild kann nicht gelesen werden.';

const errorMessage = (err: unknown): string => {
  const response = (err as { response?: { status?: number; data?: { error?: unknown } } })
    ?.response;
  const status = response?.status;
  if (status === 400 && typeof response?.data?.error === 'string' && response.data.error) {
    return response.data.error;
  }
  if (status === 429) return 'Dein Bild-Budget für heute ist aufgebraucht.';
  if (status === 503)
    return 'Das Budget ist gerade nicht abrufbar. Bitte versuche es später erneut.';
  return 'Erweitern hat nicht geklappt. Bitte versuche es noch einmal.';
};

const extensionOf = (dataUrl: string) => (/^data:image\/jpe?g/.test(dataUrl) ? 'jpg' : 'png');

const BildErweiternPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formatLabelId = useId();
  const kiLabelId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [format, setFormat] = useState<ImageFormatId>(IMAGE_FORMAT_IDS[0]);
  const [kiLabel, setKiLabel] = useState<KiLabelMode>('full');
  const [phase, setPhase] = useState<Phase>('preview');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const requestId = useRef(0);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  useEffect(() => {
    if (!originalUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setUnreadable(true);
    };
    img.src = originalUrl;
    return () => {
      cancelled = true;
    };
  }, [originalUrl]);

  const replaceUrl = (next: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setOriginalUrl(next);
  };

  const selectFile = (f: File) => {
    requestId.current += 1;
    setUploadError(null);
    setError(null);
    setResultUrl(null);
    setSize(null);
    setUnreadable(false);
    setFile(f);
    replaceUrl(URL.createObjectURL(f));
    setPhase('preview');
  };

  const reset = () => {
    requestId.current += 1;
    setFile(null);
    setSize(null);
    setUnreadable(false);
    setResultUrl(null);
    setError(null);
    replaceUrl(null);
    setPhase('preview');
  };

  const run = async () => {
    if (!file || phase === 'processing') return;
    const id = ++requestId.current;
    setPhase('processing');
    setError(null);
    try {
      const dataUrl = await outpaintImage(file, format, kiLabel);
      if (id !== requestId.current) return;
      setResultUrl(dataUrl);
      setPhase('done');
    } catch (err) {
      console.error('Bild erweitern fehlgeschlagen', err);
      if (id !== requestId.current) return;
      setError(errorMessage(err));
      setPhase('error');
    }
  };

  const editInCanvas = async () => {
    if (!resultUrl) return;
    const canvas = await mintCanvasFromImage(resultUrl, 'Erweitertes Bild');
    seedCanvasQuery(queryClient, canvas);
    void navigate(`/studio/canvas/${canvas.id}`);
  };

  const [fw, fh] = format.split(':').map(Number);
  const nothingToAdd = size ? matchesRatio(size.w, size.h, format) : false;
  const rect = size ? fitInTarget(size.w, size.h, format) : null;

  return (
    <PageContainer
      maxWidth="md"
      title="Bild erweitern"
      subtitle="KI ergänzt dein Bild auf ein neues Format"
      bgClassName={getToolGradient('bild-erweitern')}
    >
      <div className="flex flex-col gap-md">
        {!file ? (
          <ToolUpload
            icon={<PiArrowsOut aria-hidden="true" className="size-7" />}
            title="Bild hierher ziehen oder auswählen"
            subtitle="JPG, PNG oder WebP bis 10 MB"
            error={uploadError}
            onFile={selectFile}
            onError={setUploadError}
          />
        ) : null}

        {file && unreadable ? (
          <div className="flex flex-col gap-md">
            <Alert variant="destructive" role="alert">
              <AlertDescription>{UNREADABLE_MESSAGE}</AlertDescription>
            </Alert>
            <div>
              <Button type="button" variant="ghost" onClick={reset}>
                Anderes Bild
              </Button>
            </div>
          </div>
        ) : null}

        {file &&
        originalUrl &&
        !unreadable &&
        (phase === 'preview' || phase === 'processing' || phase === 'error') ? (
          <div className="grid gap-md md:grid-cols-[minmax(0,1fr)_280px] md:items-start">
            <div
              className={cn(
                TOOL_PANEL,
                'flex flex-col items-center gap-sm bg-grey-50 dark:bg-grey-900'
              )}
            >
              <div
                data-testid="outpaint-frame"
                className="relative mx-auto overflow-hidden rounded-[10px] bg-background ring-1 ring-grey-300 dark:ring-grey-600"
                style={{
                  aspectRatio: `${fw} / ${fh}`,
                  width: `min(100%, ${Math.round((PREVIEW_MAX_HEIGHT * fw) / fh)}px)`,
                  backgroundImage: HATCH,
                }}
              >
                <img
                  src={originalUrl}
                  alt="Vorschau des Originals im Zielformat"
                  className="absolute object-fill"
                  style={
                    rect
                      ? {
                          left: `${rect.left}%`,
                          top: `${rect.top}%`,
                          width: `${rect.width}%`,
                          height: `${rect.height}%`,
                        }
                      : { inset: 0, width: '100%', height: '100%', objectFit: 'contain' }
                  }
                />
              </div>
              <p className={cn(TOOL_HINT, 'text-center')}>
                {nothingToAdd
                  ? 'Dein Bild hat schon dieses Format – die KI würde nichts ergänzen.'
                  : 'Die schraffierten Flächen ergänzt die KI.'}
              </p>
            </div>

            <div className={cn(TOOL_PANEL, 'flex flex-col gap-md')}>
              <div className="flex flex-col gap-sm">
                <span id={formatLabelId} className={TOOL_LABEL}>
                  Ziel-Format
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby={formatLabelId}
                  className="flex flex-wrap gap-xs"
                >
                  {IMAGE_FORMAT_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={format === id}
                      disabled={phase === 'processing'}
                      onClick={() => setFormat(id)}
                      className={cn(TOOL_PILL, 'min-w-[56px] px-sm tabular-nums')}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-sm">
                <span id={kiLabelId} className={TOOL_LABEL}>
                  KI-Kennzeichnung
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby={kiLabelId}
                  className="flex flex-col gap-xxs"
                >
                  {KI_LABEL_OPTIONS.map((o) => (
                    <label
                      key={o.id}
                      className="flex min-h-9 cursor-pointer items-center gap-sm rounded-md px-xs text-sm hover:bg-grey-100 max-md:min-h-11 dark:hover:bg-grey-800"
                    >
                      <input
                        type="radio"
                        name="erweitern-ki-label"
                        checked={kiLabel === o.id}
                        disabled={phase === 'processing'}
                        onChange={() => setKiLabel(o.id)}
                        className="size-4 accent-primary-600"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>

              {phase === 'processing' ? (
                <ToolSpinner label="Bild wird erweitert … das dauert etwa 20–40 Sekunden" />
              ) : null}

              {phase === 'error' && error ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className={TOOL_ACTIONS}>
                <Button
                  type="button"
                  variant="brand"
                  onClick={() => void run()}
                  disabled={phase === 'processing' || !size || nothingToAdd}
                >
                  {phase === 'error' ? 'Erneut versuchen' : 'Erweitern'}
                </Button>
                <Button type="button" variant="ghost" onClick={reset}>
                  Anderes Bild
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {phase === 'done' && originalUrl && resultUrl ? (
          <ToolResultCard
            beforeSrc={originalUrl}
            afterSrc={resultUrl}
            downloadName={`erweitert-${format.replace(':', 'x')}.${extensionOf(resultUrl)}`}
            onEditInCanvas={editInCanvas}
            extraActions={
              <>
                <Button type="button" variant="outline" onClick={() => setPhase('preview')}>
                  Anderes Format
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

export default BildErweiternPage;
