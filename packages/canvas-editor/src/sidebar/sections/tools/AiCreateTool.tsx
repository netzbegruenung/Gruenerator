import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { useMessages, type Messages } from '@ggraphic/editor/i18n/messages';
import { useUserUploads } from '@ggraphic/editor/sidebar/UserUploadsProvider';
import { useCallback, useState } from 'react';
import { HiSparkles } from 'react-icons/hi';

import { useAiImageGeneration, type AiVariant } from '../../../hooks/useAiImageGeneration';
import { MOBILE_INPUT_TEXT } from '../../sidebarStyles';

import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';

const aiVariantOptions = (t: Messages): { value: AiVariant; label: string }[] => [
  { value: 'realistic', label: t.sidebar.tools.variantRealistic },
  { value: 'illustration', label: t.sidebar.tools.variantIllustration },
  { value: 'pixel', label: t.sidebar.tools.variantPixel },
];

export interface AiCreateToolProps {
  onJumpToUploads?: () => void;
}

export function AiCreateTool({ onJumpToUploads }: AiCreateToolProps) {
  const t = useMessages();
  const { generateAiImage } = useCanvasEditorServices();
  const { upload, isUploading } = useUserUploads();
  const { generate, isGenerating, generationError, remaining } = useAiImageGeneration();

  const [prompt, setPrompt] = useState('');
  const [variant, setVariant] = useState<AiVariant>('realistic');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ToolPanelSuccess | null>(null);

  const handleAction = useCallback(async () => {
    setUploadError(null);
    setSuccess(null);
    const result = await generate(prompt, variant);
    if (!result) return;
    try {
      const item = await upload(result.file);
      if (!item) throw new Error(t.sidebar.uploadFailed);
      setSuccess({
        thumbnailUrl: result.objectUrl,
        itemName: item.originalFilename ?? item.title ?? result.file.name,
        onJumpToUploads,
      });
      setPrompt('');
    } catch (err) {
      const message = err instanceof Error ? err.message : t.sidebar.tools.saveError;
      setUploadError(message);
    }
  }, [t, generate, prompt, variant, upload, onJumpToUploads]);

  if (!generateAiImage) return null;

  const canSubmit = prompt.trim().length >= 5;
  const error = uploadError ?? generationError;
  const isBusy = isGenerating || isUploading;
  const progressMessage = isGenerating
    ? t.sidebar.tools.generating
    : isUploading
      ? t.sidebar.tools.savingToUploads
      : null;

  return (
    <ToolPanel
      body={
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t.sidebar.tools.generatePlaceholder}
            rows={3}
            maxLength={500}
            disabled={isBusy}
            className={`w-full p-3 bg-background border border-[var(--font-color)] rounded-lg text-foreground text-sm ${MOBILE_INPUT_TEXT} outline-none resize-none focus:border-primary-600 disabled:opacity-50`}
          />
          <label className="flex flex-col gap-1 text-foreground-muted text-xs">
            {t.sidebar.tools.style}
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as AiVariant)}
              disabled={isBusy}
              className={`w-full py-2 px-3 bg-background border border-[var(--font-color)] rounded-lg text-foreground text-sm ${MOBILE_INPUT_TEXT} outline-none focus:border-primary-600 disabled:opacity-50`}
            >
              {aiVariantOptions(t).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      actionLabel="Generieren"
      actionIcon={HiSparkles}
      canSubmit={canSubmit}
      isBusy={isBusy}
      progressMessage={progressMessage}
      error={error}
      success={success}
      onAction={() => void handleAction()}
      footer={
        remaining !== null && !error ? (
          <p className="m-0 text-foreground-muted text-xs text-center">
            {t.sidebar.tools.remainingToday(remaining)}
          </p>
        ) : null
      }
    />
  );
}
