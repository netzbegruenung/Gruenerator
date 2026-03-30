import { AIPromptInput, Button, SettingsDropdown } from '@gruenerator/ui';
import { Download, ExternalLink } from 'lucide-react';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useApiSubmit from '../../../components/hooks/useApiSubmit';
import { useModeState } from '../../texte/hooks/useModeState';
import { MODE_MAP } from '../../texte/modes';

const IMAGINE_MODE_ID = 'imagine';

const ImagineInner: React.FC = memo(() => {
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const navigate = useNavigate();

  const def = MODE_MAP[IMAGINE_MODE_ID];
  const { state: modeState, updateField } = useModeState(IMAGINE_MODE_ID);
  const { submitForm, loading, error } = useApiSubmit(def?.endpoint ?? '/imagine/pure');

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    try {
      const payload: Record<string, unknown> = { prompt: trimmed };
      if (modeState.variant) payload.variant = modeState.variant;
      const result = await submitForm(payload);
      const base64 = (result as { image?: { base64?: string } })?.image?.base64;
      if (base64) {
        setGeneratedImage(base64);
      }
    } catch (err) {
      console.error('[ImagineInner] Generation failed:', err);
    }
  }, [prompt, loading, submitForm, modeState.variant]);

  const onSubmit = useCallback(() => void handleSubmit(), [handleSubmit]);

  const handleDownload = useCallback(() => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `gruenerator-bild-${Date.now()}.png`;
    link.click();
  }, [generatedImage]);

  const toolbar = useMemo(() => {
    const settingsConfig = def?.settings?.[0];
    if (!settingsConfig) return null;
    return (
      <SettingsDropdown
        config={settingsConfig}
        value={(modeState.variant as string) ?? ''}
        onChange={(val) => updateField('variant', val)}
      />
    );
  }, [def?.settings, modeState.variant, updateField]);

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
        <div className="rounded-xl overflow-hidden border border-grey-200 dark:border-grey-700 bg-background-pure shadow-sm">
          <img src={generatedImage} alt="Generiertes Bild" className="w-full h-auto" />
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
    </>
  );
});

ImagineInner.displayName = 'ImagineInner';

export default ImagineInner;
