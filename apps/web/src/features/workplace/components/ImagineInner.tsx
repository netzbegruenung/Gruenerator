import { useShareStore } from '@gruenerator/shared/share';
import { AIPromptInput, Button, SettingsDropdown } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, X } from 'lucide-react';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useApiSubmit from '../../../components/hooks/useApiSubmit';
import { Lightbox } from '../../image-studio/components/Lightbox';
import { useLightbox } from '../../image-studio/hooks/useLightbox';
import { useModeState } from '../../texte/hooks/useModeState';
import { MODE_MAP } from '../../texte/modes';

const IMAGINE_MODE_ID = 'imagine';

const ImagineInner: React.FC = memo(() => {
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { createImageShare } = useShareStore();
  const { isOpen, openLightbox, closeLightbox } = useLightbox();

  const def = MODE_MAP[IMAGINE_MODE_ID];
  const { state: modeState, updateField } = useModeState(IMAGINE_MODE_ID);
  const { submitForm, loading, error } = useApiSubmit(def?.endpoint ?? '/imagine/pure');

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    try {
      const payload: Record<string, unknown> = { prompt: trimmed };
      if (modeState.variant) payload.variant = modeState.variant;
      if (modeState.backend) payload.backend = modeState.backend;
      const result = await submitForm(payload);
      const base64 = (result as { image?: { base64?: string } })?.image?.base64;
      if (base64) {
        setGeneratedImage(base64);
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
      console.error('[ImagineInner] Generation failed:', err);
    }
  }, [
    prompt,
    loading,
    submitForm,
    modeState.variant,
    modeState.backend,
    createImageShare,
    queryClient,
  ]);

  const onSubmit = useCallback(() => void handleSubmit(), [handleSubmit]);

  const handleDownload = useCallback(() => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `gruenerator-bild-${Date.now()}.png`;
    link.click();
  }, [generatedImage]);

  const toolbar = useMemo(() => {
    if (!def?.settings?.length) return null;
    return (
      <>
        {def.settings.map((config) => (
          <SettingsDropdown
            key={config.key}
            config={config}
            value={(modeState[config.key] as string) ?? ''}
            onChange={(val) => updateField(config.key, val)}
          />
        ))}
      </>
    );
  }, [def?.settings, modeState, updateField]);

  return (
    <>
      <AIPromptInput
        value={prompt}
        onChange={setPrompt}
        onSubmit={onSubmit}
        isLoading={loading}
        error={error ? String(error) : null}
        placeholder={def?.placeholder ?? 'Beschreibe das Bild, das du erstellen möchtest...'}
        examples={def?.examples}
        toolbar={toolbar}
      />

      {generatedImage && (
        <div className="relative rounded-xl overflow-hidden border border-grey-200 dark:border-grey-700 bg-background-pure shadow-sm">
          <button
            onClick={() => setGeneratedImage(null)}
            className="absolute top-2 right-2 z-10 rounded-full bg-black/50 hover:bg-black/70 text-white p-1 transition-colors"
            aria-label="Bild schließen"
          >
            <X className="size-4" />
          </button>
          <img
            src={generatedImage}
            alt="Generiertes Bild"
            className="w-full h-auto cursor-zoom-in"
            onClick={openLightbox}
          />
          <div className="flex items-center gap-2 p-3 border-t border-grey-100 dark:border-grey-800">
            <Button variant="brand-outline" size="sm" onClick={handleDownload}>
              <Download className="size-3.5" />
              Download
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/studio')}>
              <ExternalLink className="size-3.5" />
              Im Studio bearbeiten
            </Button>
          </div>
        </div>
      )}

      {generatedImage && (
        <Lightbox
          isOpen={isOpen}
          onClose={closeLightbox}
          imageSrc={generatedImage}
          altText="Generiertes Bild"
        />
      )}
    </>
  );
});

ImagineInner.displayName = 'ImagineInner';

export default ImagineInner;
