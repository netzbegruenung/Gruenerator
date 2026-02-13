import { useCallback } from 'react';

import type { HelpContent, ExamplePrompt } from '@/types/baseform';

interface UseFormEventHandlersParams {
  onSubmit?: (data?: Record<string, unknown>) => void | Promise<void>;
  onExamplePromptClick?: ((prompt: ExamplePrompt) => void) | null;
  getFeatureState: () => any;
  handleFormError: (error: string) => void;
  setInlineHelpContentOverride: (content: HelpContent | null) => void;
  clearStoreError: () => void;
  setError: (error: string | Error | null) => void;
}

export function useFormEventHandlers(params: UseFormEventHandlersParams) {
  const {
    onSubmit,
    onExamplePromptClick,
    getFeatureState,
    handleFormError,
    setInlineHelpContentOverride,
    clearStoreError,
    setError,
  } = params;

  const handleEnhancedSubmit = useCallback(
    async (formData?: Record<string, unknown>) => {
      try {
        const featureState = getFeatureState();

        const enhancedFormData = {
          ...formData,
          useBedrock: featureState.proModeConfig?.isActive || false,
          useWebSearchTool:
            featureState.webSearchConfig?.isActive ||
            (formData?.useWebSearchTool as boolean) ||
            false,
          usePrivacyMode:
            featureState.privacyModeConfig?.isActive ||
            (formData?.usePrivacyMode as boolean) ||
            false,
        };

        await onSubmit?.(enhancedFormData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten';
        handleFormError(errorMessage);
      }
    },
    [onSubmit, getFeatureState, handleFormError]
  );

  const handleExamplePromptClick = useCallback(
    (text: ExamplePrompt) => {
      if (onExamplePromptClick) {
        onExamplePromptClick(text);
      }
    },
    [onExamplePromptClick]
  );

  const handlePrivacyInfoClick = useCallback(() => {
    setInlineHelpContentOverride({
      content: 'Privacy-Mode: Alles wird in Deutschland verarbeitet - beste Datenschutz-Standards.',
      tips: [
        'Server: IONOS und netzbegruenung.de',
        'PDFs: maximal 10 Seiten',
        'Bilder werden ignoriert',
      ],
    });
  }, [setInlineHelpContentOverride]);

  const handleWebSearchInfoClick = useCallback(() => {
    setInlineHelpContentOverride({
      content:
        'Die Websuche durchsucht das Internet nach aktuellen und relevanten Informationen, um deine Eingaben zu ergänzen. Nützlich, wenn du wenig Vorwissen zum Thema hast oder aktuelle Daten benötigst.',
    });
  }, [setInlineHelpContentOverride]);

  const handleErrorDismiss = useCallback(() => {
    clearStoreError();
    setError(null);
  }, [clearStoreError, setError]);

  return {
    handleEnhancedSubmit,
    handleExamplePromptClick,
    handlePrivacyInfoClick,
    handleWebSearchInfoClick,
    handleErrorDismiss,
  };
}
