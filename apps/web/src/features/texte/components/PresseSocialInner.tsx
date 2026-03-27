import { AIPromptInput } from '@gruenerator/ui';
import React, { memo, useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';

import useFormAttachments from '../../../components/common/Form/hooks/useFormAttachments';
import useStreamingFormSubmission from '../../../components/common/Form/hooks/useStreamingFormSubmission';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useUrlCrawler } from '../../../hooks/useUrlCrawler';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useModeState } from '../hooks/useModeState';
import {
  usePresseSocialSubmit,
  type PresseSocialFormData,
} from '../presse/hooks/usePresseSocialSubmit';

import GeneratorOutput from './GeneratorOutput';
import ModeExtraFields from './ModeExtraFields';
import ModeToolbar from './ModeToolbar';

import type { GeneratorSetupConfig } from '../../../hooks/useGeneratorSetup';
import type { ModeDefinition } from '../modes';

interface PresseSocialInnerProps {
  def: ModeDefinition;
}

const PresseSocialInner: React.FC<PresseSocialInnerProps> = memo(({ def }) => {
  const { state: modeState, updateField } = useModeState(def.id);
  const [prompt, setPrompt] = useState('');
  const [showResult, setShowResult] = useState(false);

  const setActiveComponent = useGeneratorSelectionStore((s) => s.setActiveComponent);
  const activatedRef = useRef(false);

  const setup = useGeneratorSetup({
    instructionType: def.instructionType as GeneratorSetupConfig['instructionType'],
    componentName: def.componentName,
  });
  const submission = useStreamingFormSubmission(def.endpoint, def.componentName, true);
  const attachments = useFormAttachments(def.componentName);
  const { crawledUrls } = useUrlCrawler();

  const allAttachments = useMemo(
    () => [...attachments.processedAttachments, ...crawledUrls],
    [attachments.processedAttachments, crawledUrls]
  );

  const submitHandler = usePresseSocialSubmit({
    features: setup.features,
    selectedDocumentIds: setup.selectedDocumentIds,
    selectedTextIds: setup.selectedTextIds,
    attachments: allAttachments,
    canUseSharepic: false,
    externalSubmitForm: submission.submitForm,
  });

  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const modeStateRef = useRef(modeState);
  modeStateRef.current = modeState;

  const onSubmit = useCallback(async () => {
    const currentPrompt = promptRef.current;
    const currentState = modeStateRef.current;
    const platforms = Array.isArray(currentState.platforms) ? currentState.platforms : [];
    const filteredPlatforms = platforms.filter((p) => p !== 'sharepic');
    if (filteredPlatforms.length === 0) return;

    if (!activatedRef.current) {
      setActiveComponent(def.componentName, def.defaultMode);
      activatedRef.current = true;
    }

    setStoreIsLoading(true);
    try {
      const formData: PresseSocialFormData = {
        inhalt: currentPrompt,
        platforms: filteredPlatforms,
        zitatgeber: (currentState.zitatgeber as string) || '',
        sharepicType: 'default',
        zitatAuthor: '',
        uploadedImage: null,
      };

      const result = setup.features.useAgentMode
        ? await submitHandler.submitAgentMode(formData)
        : await submitHandler.submitStandard(formData);

      if (result?.social) {
        const serializableContent = {
          content: result.social.content || '',
          metadata: result.social.metadata || {},
          selectedPlatforms: filteredPlatforms,
          ...(result.sharepic ? { sharepic: result.sharepic } : {}),
        };
        setGeneratedText(def.componentName, serializableContent, serializableContent.metadata);
        setShowResult(true);
      }
    } catch (error) {
      console.error('[PresseSocial] Submit error:', error);
    } finally {
      setStoreIsLoading(false);
    }
  }, [setup.features, submitHandler, setGeneratedText, setStoreIsLoading, setActiveComponent, def]);
  const isLoading = submitHandler.loading || submission.loading;
  const error =
    submitHandler.error?.message || (submission.error ? String(submission.error) : null);

  const toolbar = useMemo(
    () => (
      <ModeToolbar
        mode={def.id}
        state={modeState}
        onStateChange={updateField}
        attachedFiles={attachments.attachedFiles}
        onAttachmentClick={attachments.handleAttachmentClick}
        onRemoveFile={attachments.handleRemoveFile}
      />
    ),
    [
      def.id,
      modeState,
      updateField,
      attachments.attachedFiles,
      attachments.handleAttachmentClick,
      attachments.handleRemoveFile,
    ]
  );

  return (
    <>
      <ModeExtraFields mode={def.id} state={modeState} onChange={updateField} />
      <AIPromptInput
        value={prompt}
        onChange={setPrompt}
        onSubmit={onSubmit}
        isLoading={isLoading || submission.isStreaming}
        error={error}
        placeholder={def.placeholder}
        toolbar={toolbar}
      />
      <GeneratorOutput
        componentName={def.componentName}
        isOpen={showResult}
        onClose={() => setShowResult(false)}
        useMarkdown={def.useMarkdown}
        onRegenerate={onSubmit}
      />
    </>
  );
});

PresseSocialInner.displayName = 'PresseSocialInner';

export default PresseSocialInner;
