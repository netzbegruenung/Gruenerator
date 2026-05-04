import { useCallback, useState } from 'react';
import { HiSparkles } from 'react-icons/hi';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { useAiImageGeneration, type AiVariant } from '../../../hooks/useAiImageGeneration';
import { useUserUploads } from '../../UserUploadsProvider';

import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';

const AI_VARIANT_OPTIONS: { value: AiVariant; label: string }[] = [
  { value: 'realistic', label: 'Realistisch' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'pixel', label: 'Pixel Art' },
];

export interface AiCreateToolProps {
  onJumpToUploads?: () => void;
}

export function AiCreateTool({ onJumpToUploads }: AiCreateToolProps) {
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
      if (!item) throw new Error('Upload fehlgeschlagen');
      setSuccess({
        thumbnailUrl: result.objectUrl,
        itemName: item.originalFilename ?? item.title ?? result.file.name,
        onJumpToUploads,
      });
      setPrompt('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Speichern';
      setUploadError(message);
    }
  }, [generate, prompt, variant, upload, onJumpToUploads]);

  if (!generateAiImage) return null;

  const canSubmit = prompt.trim().length >= 5;
  const error = uploadError ?? generationError;
  const isBusy = isGenerating || isUploading;
  const progressMessage = isGenerating ? 'Generiere Bild…' : isUploading ? 'Speichern in Uploads…' : null;

  return (
    <ToolPanel
      body={
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Beschreibe dein Wunschbild (z.B. abstrakter grüner Naturhintergrund, weich und unscharf)"
            rows={3}
            maxLength={500}
            disabled={isBusy}
            className="w-full p-3 bg-background border border-[var(--font-color)] rounded-lg text-foreground text-sm outline-none resize-none focus:border-primary-600 disabled:opacity-50"
          />
          <label className="flex flex-col gap-1 text-foreground-muted text-xs">
            Stil
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as AiVariant)}
              disabled={isBusy}
              className="w-full py-2 px-3 bg-background border border-[var(--font-color)] rounded-lg text-foreground text-sm outline-none focus:border-primary-600 disabled:opacity-50"
            >
              {AI_VARIANT_OPTIONS.map((opt) => (
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
            Noch {remaining} {remaining === 1 ? 'Bild' : 'Bilder'} heute verfügbar
          </p>
        ) : null
      }
    />
  );
}
