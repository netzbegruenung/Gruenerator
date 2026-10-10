import { type KiLabelMode } from '@gruenerator/contracts';
import { IMAGE_FORMAT_IDS, type ImageFormatId } from '@gruenerator/shared/image-studio';
import { Alert, AlertDescription, Button, UploadZone } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PageContainer from '../../../components/common/PageContainer';
import { getToolGradient } from '../../../config/toolTheme';
import { mintCanvasFromImage } from '../../image-studio/bild-editor-v2/canvasHandoff';
import { seedCanvasQuery } from '../../image-studio/canvasQuery';
import { outpaintImage } from '../../image-studio/services/imageEditingService';
import { ToolResultCard } from '../components/ToolResultCard';
import { fitInTarget, matchesRatio } from '../utils/outpaintPreview';

import { cn } from '@/utils/cn';

const KI_LABEL_OPTIONS: Array<{ id: KiLabelMode; label: string }> = [
  { id: 'full', label: '„KI-Generiert mit dem Grünerator"' },
  { id: 'short', label: 'Nur „KI-Generiert"' },
  { id: 'none', label: 'Keine Kennzeichnung' },
];

const PREVIEW_MAX_HEIGHT = 420;

const HATCH = 'repeating-linear-gradient(45deg, var(--color-grey-300) 0 2px, transparent 2px 10px)';

type Phase = 'preview' | 'processing' | 'error' | 'done';

const errorMessage = (err: unknown): string => {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 429) return 'Dein Bild-Budget für heute ist aufgebraucht.';
  if (status === 503)
    return 'Das Budget ist gerade nicht abrufbar. Bitte versuche es später erneut.';
  return 'Erweitern hat nicht geklappt. Bitte versuche es noch einmal.';
};

const extensionOf = (dataUrl: string) => (/^data:image\/jpe?g/.test(dataUrl) ? 'jpg' : 'png');

const BildErweiternPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [format, setFormat] = useState<ImageFormatId>(IMAGE_FORMAT_IDS[0]);
  const [kiLabel, setKiLabel] = useState<KiLabelMode>('full');
  const [phase, setPhase] = useState<Phase>('preview');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    setFile(f);
    replaceUrl(URL.createObjectURL(f));
    setPhase('preview');
  };

  const reset = () => {
    requestId.current += 1;
    setFile(null);
    setSize(null);
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
      maxWidth="lg"
      title="Bild erweitern"
      subtitle="KI ergänzt dein Bild auf ein neues Format"
      bgClassName={getToolGradient('bild-erweitern')}
    >
      <div className="flex flex-col gap-md">
        {!file ? (
          <>
            <UploadZone
              variant="minimal"
              accept={{ 'image/*': [] }}
              maxSizeMB={10}
              title="Bild hierher ziehen oder auswählen"
              subtitle="JPG, PNG oder WebP bis 10 MB"
              onFileSelected={selectFile}
              onError={(msg: string) => setUploadError(msg)}
            />
            {uploadError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : null}

        {file &&
        originalUrl &&
        (phase === 'preview' || phase === 'processing' || phase === 'error') ? (
          <div className="flex flex-col gap-md">
            <div
              data-testid="outpaint-frame"
              className="relative mx-auto overflow-hidden rounded-[10px] border border-grey-200 dark:border-grey-700"
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
            <p className="m-0 text-center text-xs text-grey-500">
              {nothingToAdd
                ? 'Dein Bild hat schon dieses Format – die KI würde nichts ergänzen.'
                : 'Die schraffierten Flächen ergänzt die KI.'}
            </p>

            <div className="flex flex-col gap-xs">
              <span id="erweitern-format" className="text-xs font-bold uppercase text-grey-500">
                Ziel-Format
              </span>
              <div
                role="radiogroup"
                aria-labelledby="erweitern-format"
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
                    className={cn(
                      'cursor-pointer rounded-full border px-3 py-1 text-sm font-semibold transition-colors',
                      format === id
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-grey-300 hover:bg-grey-100 dark:border-grey-600 dark:hover:bg-grey-800'
                    )}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-xs">
              <span id="erweitern-label" className="text-xs font-bold uppercase text-grey-500">
                KI-Kennzeichnung
              </span>
              <div
                role="radiogroup"
                aria-labelledby="erweitern-label"
                className="flex flex-col gap-xxs"
              >
                {KI_LABEL_OPTIONS.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-xs text-sm">
                    <input
                      type="radio"
                      name="erweitern-ki-label"
                      checked={kiLabel === o.id}
                      disabled={phase === 'processing'}
                      onChange={() => setKiLabel(o.id)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>

            {phase === 'processing' ? (
              <div role="status" aria-live="polite" className="flex items-center gap-sm">
                <span
                  aria-hidden="true"
                  className="size-5 animate-spin rounded-full border-2 border-grey-300 border-t-primary-600"
                />
                <span>Bild wird erweitert … das dauert etwa 20–40 Sekunden</span>
              </div>
            ) : null}

            {phase === 'error' && error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-sm">
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
        ) : null}

        {phase === 'done' && originalUrl && resultUrl ? (
          <>
            <ToolResultCard
              beforeSrc={originalUrl}
              afterSrc={resultUrl}
              downloadName={`erweitert-${format.replace(':', 'x')}.${extensionOf(resultUrl)}`}
              onEditInCanvas={editInCanvas}
            />
            <div className="flex flex-wrap gap-sm">
              <Button type="button" variant="outline" onClick={() => setPhase('preview')}>
                Anderes Format
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

export default BildErweiternPage;
