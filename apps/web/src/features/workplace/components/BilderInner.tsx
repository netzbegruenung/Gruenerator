import { getGlobalApiClient } from '@gruenerator/shared/api';
import {
  FLUX_VARIANT_ORDER,
  IMAGE_FAMILIES,
  IMAGE_MODEL_BY_ID,
  getDefaultModelForFamily,
  getImageFamily,
  type ImageFamilyId,
  type ImageModelId,
} from '@gruenerator/shared/models';
import { useShareStore } from '@gruenerator/shared/share';
import { AIPromptInput, Button, SettingsDropdown, type SettingConfig } from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Image as ImageIcon, ImagePlus, X } from 'lucide-react';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import useApiSubmit from '../../../components/hooks/useApiSubmit';
import { Lightbox } from '../../image-studio/components/Lightbox';
import { useLightbox } from '../../image-studio/hooks/useLightbox';
import {
  editAiImage,
  removeImageBackground,
} from '../../image-studio/services/imageEditingService';
import { useImageModelPreference } from '../../models/hooks/useImageModelPreference';
import { useModeState } from '../../texte/hooks/useModeState';
import { MODE_MAP } from '../../texte/modes';

import { cn } from '@/utils/cn';

type SubMode = 'erstellen' | 'bearbeiten' | 'begruenen' | 'vergroessern' | 'hintergrund';

const SUB_MODE_OPTIONS: SettingConfig['options'] = [
  { id: 'erstellen', label: 'Erstellen' },
  { id: 'bearbeiten', label: 'Bearbeiten' },
  { id: 'begruenen', label: '🌳 Begrünen' },
  { id: 'vergroessern', label: 'Vergrößern' },
  ...(import.meta.env.DEV ? [{ id: 'hintergrund', label: 'Hintergrund entfernen' }] : []),
];

const SUB_MODE_CONFIG: SettingConfig = {
  key: 'subMode',
  label: 'Modus',
  options: SUB_MODE_OPTIONS,
  multiple: false,
};

const ERSTELLEN_MODE_ID = 'imagine';
const BEARBEITEN_MODE_ID = 'bild-bearbeiten';
const BEGRUENEN_MODE_ID = 'bild-begruenen';
const VERGROESSERN_MODE_ID = 'bild-vergroessern';
const HINTERGRUND_MODE_ID = 'bild-hintergrund-entfernen';

const IMAGE_FAMILY_CONFIG: SettingConfig = {
  key: 'imageFamily',
  label: 'Modell',
  options: IMAGE_FAMILIES.map((f) => ({ id: f.id, label: f.name })),
  multiple: false,
};

const FLUX_VARIANT_LABEL_RE = /^(?:⭐\s+)?Flux\s+/;

function shortCost(multiplier: number): string {
  if (multiplier === 0.5) return '½ Bild';
  if (multiplier === 1) return '1 Bild';
  return `${multiplier} Bilder`;
}

const FLUX_VARIANT_CONFIG: SettingConfig = {
  key: 'fluxVariant',
  label: 'Variante',
  options: FLUX_VARIANT_ORDER.map((id) => {
    const variant = IMAGE_MODEL_BY_ID[id];
    const bareName = variant.name.replace(FLUX_VARIANT_LABEL_RE, '');
    return { id, label: `${bareName} (${shortCost(variant.costMultiplier)})` };
  }),
  multiple: false,
};

type AspectRatio = '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'custom';

const ASPECT_RATIO_CONFIG: SettingConfig = {
  key: 'aspectRatio',
  label: 'Format',
  options: [
    { id: '16:9', label: 'Querformat 16:9' },
    { id: '4:3', label: 'Querformat 4:3' },
    { id: '1:1', label: 'Quadrat 1:1' },
    { id: '3:4', label: 'Hochformat 3:4' },
    { id: '9:16', label: 'Hochformat 9:16' },
    { id: 'custom', label: 'Frei (Pixel)' },
  ],
  multiple: false,
};

const MIN_CUSTOM_SIDE = 256;
const MAX_CUSTOM_SIDE = 2048;
const MAX_CUSTOM_AREA = 4_194_304;

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
      className={`inline-flex items-center gap-1 rounded-full px-sm py-xs text-xs font-medium ${
        isLow
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
          : 'bg-grey-100 text-grey-700 dark:bg-grey-800 dark:text-grey-300'
      }`}
      title={`Heutiges Tageskontingent: ${formatImageCount(usage.count)} von ${usage.limit} Bildern heute verbraucht`}
      aria-label={`${formatImageCount(usage.remaining)} von ${usage.limit} Bildern heute übrig`}
    >
      <ImageIcon className="size-3.5" aria-hidden="true" />
      {formatImageCount(usage.remaining)}/{usage.limit}
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
  const [greenEditError, setGreenEditError] = useState<string | null>(null);
  const [greenEditLoading, setGreenEditLoading] = useState(false);
  const [removeBgError, setRemoveBgError] = useState<string | null>(null);
  const [removeBgLoading, setRemoveBgLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { createImageShare } = useShareStore();
  const { isOpen, openLightbox, closeLightbox } = useLightbox();

  const erstellenDef = MODE_MAP[ERSTELLEN_MODE_ID];
  const bearbeitenDef = MODE_MAP[BEARBEITEN_MODE_ID];
  const begruenenDef = MODE_MAP[BEGRUENEN_MODE_ID];
  const vergroessernDef = MODE_MAP[VERGROESSERN_MODE_ID];
  const hintergrundDef = MODE_MAP[HINTERGRUND_MODE_ID];
  const isErstellen = subMode === 'erstellen';
  const isBearbeiten = subMode === 'bearbeiten';
  const isBegruenen = subMode === 'begruenen';
  const isVergroessern = subMode === 'vergroessern';
  const isHintergrund = subMode === 'hintergrund';
  const activeDef = isErstellen
    ? erstellenDef
    : isBearbeiten
      ? bearbeitenDef
      : isBegruenen
        ? begruenenDef
        : isVergroessern
          ? vergroessernDef
          : hintergrundDef;

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [customWidth, setCustomWidth] = useState<number>(1280);
  const [customHeight, setCustomHeight] = useState<number>(1280);
  const [outpaintLoading, setOutpaintLoading] = useState(false);
  const isCustomAspect = aspectRatio === 'custom';
  const customArea = customWidth * customHeight;
  const customSizeValid =
    customWidth >= MIN_CUSTOM_SIDE &&
    customWidth <= MAX_CUSTOM_SIDE &&
    customHeight >= MIN_CUSTOM_SIDE &&
    customHeight <= MAX_CUSTOM_SIDE &&
    customArea <= MAX_CUSTOM_AREA;
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

  const subModeRef = useRef<SubMode>(subMode);
  subModeRef.current = subMode;
  const removeBgHandlerRef = useRef<((file: File) => void) | null>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;
      if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
      setSourceFile(file);
      setSourcePreviewUrl(URL.createObjectURL(file));
      setEditError(null);
      if (subModeRef.current === 'hintergrund') {
        removeBgHandlerRef.current?.(file);
      }
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

  const handleSubmitGreenEdit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!sourceFile || !trimmed || greenEditLoading) return;
    setGreenEditLoading(true);
    setGreenEditError(null);
    try {
      const { objectUrl, base64 } = await editAiImage(sourceFile, trimmed, 'green-edit');
      setResult(objectUrl, true);
      createImageShare({
        imageData: base64,
        title: trimmed.slice(0, 100),
        imageType: 'edit',
        status: 'ready',
        metadata: {
          prompt: trimmed,
          sourceFilename: sourceFile.name,
          editType: 'green-edit',
        },
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ['recent-activity'] }))
        .catch(() => {});
    } catch (err) {
      console.error('[BilderInner:begruenen] Green edit failed:', err);
      setGreenEditError(err instanceof Error ? err.message : 'Begrünung fehlgeschlagen');
    } finally {
      setGreenEditLoading(false);
    }
  }, [prompt, sourceFile, greenEditLoading, setResult, createImageShare, queryClient]);

  const handleSubmitRemoveBg = useCallback(
    async (fileOverride?: File) => {
      const file = fileOverride ?? sourceFile;
      if (!file || removeBgLoading) return;
      setRemoveBgLoading(true);
      setRemoveBgError(null);
      try {
        const { objectUrl, base64 } = await removeImageBackground(file);
        setResult(objectUrl, true);
        const title = `Ohne Hintergrund — ${file.name}`;
        createImageShare({
          imageData: base64,
          title: title.slice(0, 100),
          imageType: 'edit',
          status: 'ready',
          metadata: { sourceFilename: file.name, editType: 'remove-background' },
        })
          .then(() => queryClient.invalidateQueries({ queryKey: ['recent-activity'] }))
          .catch(() => {});
      } catch (err) {
        console.error('[BilderInner:hintergrund] Background removal failed:', err);
        setRemoveBgError(
          err instanceof Error ? err.message : 'Hintergrundentfernung fehlgeschlagen'
        );
      } finally {
        setRemoveBgLoading(false);
      }
    },
    [sourceFile, removeBgLoading, setResult, createImageShare, queryClient]
  );
  removeBgHandlerRef.current = (file: File) => {
    void handleSubmitRemoveBg(file);
  };

  const handleSubmitOutpaint = useCallback(async () => {
    if (!sourceFile || outpaintLoading) return;
    if (isCustomAspect && !customSizeValid) {
      setOutpaintError(
        `Ungültige Größe — ${MIN_CUSTOM_SIDE}–${MAX_CUSTOM_SIDE}px pro Seite, max. ${MAX_CUSTOM_AREA / 1_000_000} MP.`
      );
      return;
    }
    setOutpaintLoading(true);
    setOutpaintError(null);
    try {
      const form = new FormData();
      form.append('image', sourceFile);
      form.append('aspectRatio', aspectRatio);
      if (isCustomAspect) {
        form.append('width', String(customWidth));
        form.append('height', String(customHeight));
      }
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
      const sizeLabel = isCustomAspect ? `${customWidth}×${customHeight}` : aspectRatio;
      const title = `Vergrößert ${sizeLabel} — ${sourceFile.name}`;
      createImageShare({
        imageData: base64,
        title: title.slice(0, 100),
        imageType: 'imagine',
        status: 'ready',
        metadata: {
          sourceFilename: sourceFile.name,
          aspectRatio,
          ...(isCustomAspect && { customWidth, customHeight }),
        },
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ['recent-activity'] }))
        .catch(() => {});
    } catch (err) {
      console.error('[BilderInner:vergroessern] Outpaint failed:', err);
      setOutpaintError(err instanceof Error ? err.message : 'Vergrößerung fehlgeschlagen');
    } finally {
      setOutpaintLoading(false);
    }
  }, [
    sourceFile,
    outpaintLoading,
    aspectRatio,
    isCustomAspect,
    customWidth,
    customHeight,
    customSizeValid,
    setResult,
    createImageShare,
    queryClient,
  ]);

  const onSubmit = useCallback(() => {
    if (isErstellen) {
      void handleSubmitCreate();
    } else if (isBearbeiten) {
      void handleSubmitEdit();
    } else if (isBegruenen) {
      void handleSubmitGreenEdit();
    } else if (isVergroessern) {
      void handleSubmitOutpaint();
    } else {
      void handleSubmitRemoveBg();
    }
  }, [
    isErstellen,
    isBearbeiten,
    isBegruenen,
    isVergroessern,
    handleSubmitCreate,
    handleSubmitEdit,
    handleSubmitGreenEdit,
    handleSubmitOutpaint,
    handleSubmitRemoveBg,
  ]);

  const handleDownload = useCallback(() => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    const slug = isErstellen
      ? 'bild'
      : isBearbeiten
        ? 'bearbeitet'
        : isBegruenen
          ? 'begruent'
          : isVergroessern
            ? 'vergroessert'
            : 'ohne-hintergrund';
    link.download = `gruenerator-${slug}-${Date.now()}.png`;
    link.click();
  }, [resultImage, isErstellen, isBearbeiten, isBegruenen, isVergroessern]);

  const vergroessernDropZone = useMemo(
    () =>
      sourcePreviewUrl ? (
        <div className="flex items-center gap-3 py-1">
          <img
            src={sourcePreviewUrl}
            alt=""
            className="size-12 object-cover rounded-md border border-grey-200 dark:border-grey-700"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-foreground">
              {sourceFile?.name ?? 'Bild'}
            </div>
            <div className="text-xs text-grey-500">Bereit zum Vergrößern</div>
          </div>
          <button
            type="button"
            onClick={clearSource}
            className="text-grey-400 hover:text-grey-700 dark:hover:text-grey-200 p-1"
            aria-label="Bild entfernen"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center gap-2 py-1 text-grey-500 dark:text-grey-400 hover:text-foreground transition-colors"
        >
          <ImagePlus className="size-4" />
          <span className="text-[15px]">Bild zum Vergrößern hochladen</span>
        </button>
      ),
    [sourcePreviewUrl, sourceFile, clearSource]
  );

  const filePickerPill = useMemo(
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

  const selectedImageModel = (modeState.imageModel as ImageModelId | undefined) ?? null;
  const selectedFamily: ImageFamilyId | null = selectedImageModel
    ? getImageFamily(selectedImageModel)
    : null;

  const handleFamilyChange = useCallback(
    (familyId: ImageFamilyId) => {
      updateField('imageModel', getDefaultModelForFamily(familyId));
    },
    [updateField]
  );

  const handleFluxVariantChange = useCallback(
    (variantId: ImageModelId) => {
      updateField('imageModel', variantId);
    },
    [updateField]
  );

  const toolbar = useMemo(
    () => (
      <>
        <SettingsDropdown
          config={SUB_MODE_CONFIG}
          value={subMode}
          onChange={(val) => setSubMode(val as SubMode)}
        />
        {isErstellen &&
          erstellenDef?.settings?.map((config) => (
            <SettingsDropdown
              key={config.key}
              config={config}
              value={(modeState[config.key] as string) ?? ''}
              onChange={(val) => updateField(config.key, val as string)}
            />
          ))}
        {isErstellen && (
          <SettingsDropdown
            config={IMAGE_FAMILY_CONFIG}
            value={selectedFamily ?? 'flux'}
            onChange={(val) => handleFamilyChange(val as ImageFamilyId)}
          />
        )}
        {isErstellen && selectedFamily === 'flux' && (
          <SettingsDropdown
            config={FLUX_VARIANT_CONFIG}
            value={selectedImageModel ?? 'flux-pro'}
            onChange={(val) => handleFluxVariantChange(val as ImageModelId)}
          />
        )}
        {(isBearbeiten || isBegruenen || isHintergrund) && filePickerPill}
        {isVergroessern && (
          <SettingsDropdown
            config={ASPECT_RATIO_CONFIG}
            value={aspectRatio}
            onChange={(val) => setAspectRatio(val as AspectRatio)}
          />
        )}
        {isVergroessern && isCustomAspect && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
              customSizeValid
                ? 'border-grey-200 dark:border-grey-700 text-grey-700 dark:text-grey-300'
                : 'border-red-300 text-red-600 dark:border-red-700 dark:text-red-400'
            )}
            title={`${MIN_CUSTOM_SIDE}–${MAX_CUSTOM_SIDE}px pro Seite, max. ${MAX_CUSTOM_AREA / 1_000_000} MP`}
          >
            <input
              type="number"
              min={MIN_CUSTOM_SIDE}
              max={MAX_CUSTOM_SIDE}
              step={8}
              value={customWidth}
              onChange={(e) => setCustomWidth(Number(e.target.value) || 0)}
              className="w-16 bg-transparent text-right outline-none"
              aria-label="Breite in Pixeln"
            />
            <span className="text-grey-400">×</span>
            <input
              type="number"
              min={MIN_CUSTOM_SIDE}
              max={MAX_CUSTOM_SIDE}
              step={8}
              value={customHeight}
              onChange={(e) => setCustomHeight(Number(e.target.value) || 0)}
              className="w-16 bg-transparent outline-none"
              aria-label="Höhe in Pixeln"
            />
            <span className="text-grey-400">px</span>
          </span>
        )}
        {usage && <UsageBadge usage={usage} />}
      </>
    ),
    [
      subMode,
      isErstellen,
      isBearbeiten,
      isBegruenen,
      isVergroessern,
      isHintergrund,
      isCustomAspect,
      customWidth,
      customHeight,
      customSizeValid,
      erstellenDef?.settings,
      modeState,
      updateField,
      selectedFamily,
      selectedImageModel,
      handleFamilyChange,
      handleFluxVariantChange,
      filePickerPill,
      aspectRatio,
      usage,
    ]
  );

  const loading = isErstellen
    ? createLoading
    : isBearbeiten
      ? editLoading
      : isBegruenen
        ? greenEditLoading
        : isVergroessern
          ? outpaintLoading
          : removeBgLoading;
  const error = isErstellen
    ? createError
      ? String(createError)
      : null
    : isBearbeiten
      ? editError
      : isBegruenen
        ? greenEditError
        : isVergroessern
          ? outpaintError
          : removeBgError;
  const altText = isErstellen
    ? 'Generiertes Bild'
    : isBearbeiten
      ? 'Bearbeitetes Bild'
      : isBegruenen
        ? 'Begrüntes Bild'
        : isVergroessern
          ? 'Vergrößertes Bild'
          : 'Bild ohne Hintergrund';

  return (
    <div className="flex flex-col gap-md">
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
        inputAreaOverride={isVergroessern ? vergroessernDropZone : undefined}
        canSubmit={
          isVergroessern ? !!sourceFile && (!isCustomAspect || customSizeValid) : undefined
        }
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
