import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useShareStore } from '@gruenerator/shared/share';
import {
  AIPromptInput,
  Button,
  SettingsDropdown,
  pillBase,
  pillInactive,
  pillActive,
  type SettingConfig,
} from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ImagePlus, X } from 'lucide-react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import useApiSubmit from '../../../components/hooks/useApiSubmit';
import { Lightbox } from '../../image-studio/components/Lightbox';
import { useLightbox } from '../../image-studio/hooks/useLightbox';
import { editAiImage } from '../../image-studio/services/imageEditingService';
import { useImageModelPreference } from '../../models/hooks/useImageModelPreference';
import { useModeState } from '../../texte/hooks/useModeState';
import { MODE_MAP } from '../../texte/modes';

import { cn } from '@/utils/cn';

type SubMode = 'erstellen' | 'bearbeiten' | 'vergroessern';

const SUB_TABS: ReadonlyArray<{ id: SubMode; label: string }> = [
  { id: 'erstellen', label: 'Erstellen' },
  { id: 'bearbeiten', label: 'Bearbeiten' },
  { id: 'vergroessern', label: 'Vergrößern' },
];

const ERSTELLEN_MODE_ID = 'imagine';
const BEARBEITEN_MODE_ID = 'bild-bearbeiten';
const VERGROESSERN_MODE_ID = 'bild-vergroessern';

type AspectRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16';

const ASPECT_RATIO_CONFIG: SettingConfig = {
  key: 'aspectRatio',
  label: 'Format',
  options: [
    { id: '16:9', label: 'Querformat 16:9' },
    { id: '4:3', label: 'Querformat 4:3' },
    { id: '1:1', label: 'Quadrat 1:1' },
    { id: '3:4', label: 'Hochformat 3:4' },
    { id: '9:16', label: 'Hochformat 9:16' },
  ],
  multiple: false,
};

interface UsageStatus {
  count: number;
  remaining: number;
  limit: number;
}

interface UsageStatusResponse {
  success: boolean;
  data?: UsageStatus & { timeUntilReset?: string };
}

function formatImageCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

function UsageBadge({ usage }: { usage: UsageStatus }) {
  const isLow = usage.remaining <= 1;
  return (
    <span
      className={`inline-flex items-center rounded-full px-sm py-xs text-xs font-medium ${
        isLow
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
          : 'bg-grey-100 text-grey-700 dark:bg-grey-800 dark:text-grey-300'
      }`}
      title={`Heutiges Tageskontingent: ${formatImageCount(usage.count)} von ${usage.limit} Bildern verbraucht`}
    >
      {formatImageCount(usage.remaining)} / {usage.limit} Bilder heute
    </span>
  );
}

const BilderInner: React.FC = memo(() => {
  const [subMode, setSubMode] = useState<SubMode>('erstellen');
  const [prompt, setPrompt] = useState('');

  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultIsObjectUrl, setResultIsObjectUrl] = useState(false);

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);

  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { createImageShare } = useShareStore();
  const { isOpen, openLightbox, closeLightbox } = useLightbox();

  const erstellenDef = MODE_MAP[ERSTELLEN_MODE_ID];
  const bearbeitenDef = MODE_MAP[BEARBEITEN_MODE_ID];
  const vergroessernDef = MODE_MAP[VERGROESSERN_MODE_ID];
  const isErstellen = subMode === 'erstellen';
  const isBearbeiten = subMode === 'bearbeiten';
  const isVergroessern = subMode === 'vergroessern';
  const activeDef = isErstellen ? erstellenDef : isBearbeiten ? bearbeitenDef : vergroessernDef;

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [outpaintLoading, setOutpaintLoading] = useState(false);
  const [outpaintError, setOutpaintError] = useState<string | null>(null);

  const { state: modeState, updateField } = useModeState(ERSTELLEN_MODE_ID);

  const {
    submitForm,
    loading: createLoading,
    error: createError,
  } = useApiSubmit(erstellenDef?.endpoint ?? '/imagine/pure');

  const { defaultImageModel, isLoading: isPrefLoading } = useImageModelPreference();
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || isPrefLoading) return;
    seededRef.current = true;
    if (defaultImageModel !== modeState.imageModel) {
      updateField('imageModel', defaultImageModel);
    }
  }, [isPrefLoading, defaultImageModel, modeState.imageModel, updateField]);

  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const usageQuery = useQuery({
    queryKey: ['image-generation-status'],
    queryFn: async (): Promise<UsageStatus | null> => {
      const res = await getGlobalApiClient().get<UsageStatusResponse>('/image-generation/status');
      return res.data.data ?? null;
    },
    staleTime: 60_000,
  });
  useEffect(() => {
    if (usageQuery.data) setUsage(usageQuery.data);
  }, [usageQuery.data]);

  useEffect(
    () => () => {
      if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
    },
    [sourcePreviewUrl]
  );

  useEffect(
    () => () => {
      if (resultImage && resultIsObjectUrl) URL.revokeObjectURL(resultImage);
    },
    [resultImage, resultIsObjectUrl]
  );

  const setResult = useCallback(
    (url: string, isObjectUrl: boolean) => {
      if (resultImage && resultIsObjectUrl) URL.revokeObjectURL(resultImage);
      setResultImage(url);
      setResultIsObjectUrl(isObjectUrl);
    },
    [resultImage, resultIsObjectUrl]
  );

  const clearResult = useCallback(() => {
    if (resultImage && resultIsObjectUrl) URL.revokeObjectURL(resultImage);
    setResultImage(null);
    setResultIsObjectUrl(false);
  }, [resultImage, resultIsObjectUrl]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;
      if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
      setSourceFile(file);
      setSourcePreviewUrl(URL.createObjectURL(file));
      setEditError(null);
    },
    [sourcePreviewUrl]
  );

  const clearSource = useCallback(() => {
    if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
    setSourceFile(null);
    setSourcePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [sourcePreviewUrl]);

  const handleSubmitCreate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || createLoading) return;
    try {
      const payload: Record<string, unknown> = { prompt: trimmed };
      if (modeState.variant) payload.variant = modeState.variant;
      if (modeState.imageModel) payload.imageModel = modeState.imageModel;
      const result = await submitForm(payload);
      const usageFromResponse = (result as { usage?: UsageStatus })?.usage;
      if (usageFromResponse) setUsage(usageFromResponse);
      const base64 = (result as { image?: { base64?: string } })?.image?.base64;
      if (base64) {
        setResult(base64, false);
        createImageShare({
          imageData: base64,
          title: trimmed.slice(0, 100),
          imageType: 'imagine',
          status: 'ready',
          metadata: { prompt: trimmed },
        })
          .then(() => queryClient.invalidateQueries({ queryKey: ['recent-activity'] }))
          .catch(() => {});
      }
    } catch (err) {
      console.error('[BilderInner:erstellen] Generation failed:', err);
    }
  }, [
    prompt,
    createLoading,
    submitForm,
    modeState.variant,
    modeState.imageModel,
    setResult,
    createImageShare,
    queryClient,
  ]);

  const handleSubmitEdit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!sourceFile || !trimmed || editLoading) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const { objectUrl, base64 } = await editAiImage(sourceFile, trimmed);
      setResult(objectUrl, true);
      createImageShare({
        imageData: base64,
        title: trimmed.slice(0, 100),
        imageType: 'edit',
        status: 'ready',
        metadata: { prompt: trimmed, sourceFilename: sourceFile.name },
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ['recent-activity'] }))
        .catch(() => {});
    } catch (err) {
      console.error('[BilderInner:bearbeiten] Edit failed:', err);
      setEditError(err instanceof Error ? err.message : 'Bearbeitung fehlgeschlagen');
    } finally {
      setEditLoading(false);
    }
  }, [prompt, sourceFile, editLoading, setResult, createImageShare, queryClient]);

  const handleSubmitOutpaint = useCallback(async () => {
    if (!sourceFile || outpaintLoading) return;
    setOutpaintLoading(true);
    setOutpaintError(null);
    try {
      const form = new FormData();
      form.append('image', sourceFile);
      form.append('aspectRatio', aspectRatio);
      const res = await getGlobalApiClient().post<{
        success: boolean;
        image?: { base64?: string };
        error?: string;
      }>('/imagine/outpaint', form);
      if (!res.data.success || !res.data.image?.base64) {
        throw new Error(res.data.error || 'Vergrößerung fehlgeschlagen');
      }
      const base64 = res.data.image.base64;
      setResult(base64, false);
      const title = `Vergrößert ${aspectRatio} — ${sourceFile.name}`;
      createImageShare({
        imageData: base64,
        title: title.slice(0, 100),
        imageType: 'imagine',
        status: 'ready',
        metadata: { sourceFilename: sourceFile.name, aspectRatio },
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ['recent-activity'] }))
        .catch(() => {});
    } catch (err) {
      console.error('[BilderInner:vergroessern] Outpaint failed:', err);
      setOutpaintError(err instanceof Error ? err.message : 'Vergrößerung fehlgeschlagen');
    } finally {
      setOutpaintLoading(false);
    }
  }, [sourceFile, outpaintLoading, aspectRatio, setResult, createImageShare, queryClient]);

  const onSubmit = useCallback(() => {
    if (isErstellen) {
      void handleSubmitCreate();
    } else if (isBearbeiten) {
      void handleSubmitEdit();
    } else {
      void handleSubmitOutpaint();
    }
  }, [isErstellen, isBearbeiten, handleSubmitCreate, handleSubmitEdit, handleSubmitOutpaint]);

  const handleDownload = useCallback(() => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    const slug = isErstellen ? 'bild' : isBearbeiten ? 'bearbeitet' : 'vergroessert';
    link.download = `gruenerator-${slug}-${Date.now()}.png`;
    link.click();
  }, [resultImage, isErstellen, isBearbeiten]);

  const erstellenToolbar = useMemo(() => {
    if (!erstellenDef?.settings?.length && !usage) return null;
    return (
      <>
        {erstellenDef?.settings?.map((config) => (
          <SettingsDropdown
            key={config.key}
            config={config}
            value={(modeState[config.key] as string) ?? ''}
            onChange={(val) => updateField(config.key, val as string)}
          />
        ))}
        {usage && <UsageBadge usage={usage} />}
      </>
    );
  }, [erstellenDef?.settings, modeState, updateField, usage]);

  const bearbeitenToolbar = useMemo(
    () =>
      sourcePreviewUrl ? (
        <div className="flex items-center gap-1.5 rounded-md border border-grey-200 dark:border-grey-700 bg-background-pure pl-1 pr-1.5 py-0.5">
          <img src={sourcePreviewUrl} alt="" className="size-6 object-cover rounded" />
          <span className="text-xs text-grey-600 dark:text-grey-300 max-w-[120px] truncate">
            {sourceFile?.name ?? 'Bild'}
          </span>
          <button
            type="button"
            onClick={clearSource}
            className="text-grey-400 hover:text-grey-600 dark:hover:text-grey-200"
            aria-label="Bild entfernen"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-xs text-grey-500 dark:text-grey-400 hover:text-grey-700 dark:hover:text-grey-200 px-2 py-1 rounded-md hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors"
        >
          <ImagePlus className="size-3.5" />
          Bild hochladen
        </button>
      ),
    [sourcePreviewUrl, sourceFile, clearSource]
  );

  const vergroessernToolbar = useMemo(
    () => (
      <>
        {sourcePreviewUrl ? (
          <div className="flex items-center gap-1.5 rounded-md border border-grey-200 dark:border-grey-700 bg-background-pure pl-1 pr-1.5 py-0.5">
            <img src={sourcePreviewUrl} alt="" className="size-6 object-cover rounded" />
            <span className="text-xs text-grey-600 dark:text-grey-300 max-w-[120px] truncate">
              {sourceFile?.name ?? 'Bild'}
            </span>
            <button
              type="button"
              onClick={clearSource}
              className="text-grey-400 hover:text-grey-600 dark:hover:text-grey-200"
              aria-label="Bild entfernen"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-grey-500 dark:text-grey-400 hover:text-grey-700 dark:hover:text-grey-200 px-2 py-1 rounded-md hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors"
          >
            <ImagePlus className="size-3.5" />
            Bild hochladen
          </button>
        )}
        <SettingsDropdown
          config={ASPECT_RATIO_CONFIG}
          value={aspectRatio}
          onChange={(val) => setAspectRatio(val as AspectRatio)}
        />
      </>
    ),
    [sourcePreviewUrl, sourceFile, clearSource, aspectRatio]
  );

  const loading = isErstellen ? createLoading : isBearbeiten ? editLoading : outpaintLoading;
  const error = isErstellen
    ? createError
      ? String(createError)
      : null
    : isBearbeiten
      ? editError
      : outpaintError;
  const toolbar = isErstellen
    ? erstellenToolbar
    : isBearbeiten
      ? bearbeitenToolbar
      : vergroessernToolbar;
  const altText = isErstellen
    ? 'Generiertes Bild'
    : isBearbeiten
      ? 'Bearbeitetes Bild'
      : 'Vergrößertes Bild';

  return (
    <div className="flex flex-col gap-md">
      <div className="flex justify-center gap-1.5">
        {SUB_TABS.map((tab) => {
          const active = tab.id === subMode;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubMode(tab.id)}
              className={cn(pillBase, active ? pillActive : pillInactive)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <AIPromptInput
        value={prompt}
        onChange={setPrompt}
        onSubmit={onSubmit}
        isLoading={loading}
        error={error}
        placeholder={activeDef?.placeholder ?? ''}
        examples={activeDef?.examples}
        toolbar={toolbar}
      />

      {resultImage && (
        <div className="relative rounded-xl overflow-hidden border border-grey-200 dark:border-grey-700 bg-background-pure shadow-sm">
          <button
            onClick={clearResult}
            className="absolute top-2 right-2 z-10 rounded-full bg-black/50 hover:bg-black/70 text-white p-1 transition-colors"
            aria-label="Bild schließen"
            type="button"
          >
            <X className="size-4" />
          </button>
          <div className={cn('flex justify-center', !isErstellen && 'bg-grey-50 dark:bg-grey-900')}>
            <img
              src={resultImage}
              alt={altText}
              className={cn(
                'cursor-zoom-in',
                isErstellen ? 'w-full h-auto' : 'max-h-[60vh] w-auto h-auto object-contain'
              )}
              onClick={openLightbox}
            />
          </div>
          <div className="flex items-center gap-2 p-3 border-t border-grey-100 dark:border-grey-800">
            <Button variant="brand-outline" size="sm" onClick={handleDownload}>
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
        </div>
      )}

      {resultImage && (
        <Lightbox
          isOpen={isOpen}
          onClose={closeLightbox}
          imageSrc={resultImage}
          altText={altText}
        />
      )}
    </div>
  );
});

BilderInner.displayName = 'BilderInner';

export default BilderInner;
