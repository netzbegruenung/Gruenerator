import { AIPromptInput } from '@gruenerator/ui';
import React, { memo, useCallback, useMemo, useRef, useState } from 'react';

import { useGenerator } from '../hooks/useGenerator';
import { useModeState } from '../hooks/useModeState';

import GeneratorOutput from './GeneratorOutput';
import ModeExtraFields from './ModeExtraFields';
import ModeToolbar from './ModeToolbar';

import type { GeneratorSetupConfig } from '../../../hooks/useGeneratorSetup';
import type { ModeDefinition } from '../modes';

interface GeneratorInnerProps {
  def: ModeDefinition;
}

const GeneratorInner: React.FC<GeneratorInnerProps> = memo(({ def }) => {
  const [showResult, setShowResult] = useState(false);
  const { state: modeState, updateField } = useModeState(def.id, def);

  const gen = useGenerator({
    componentName: def.componentName,
    endpoint: def.endpoint,
    instructionType: def.instructionType as GeneratorSetupConfig['instructionType'],
    defaultMode: def.defaultMode,
    searchQueryFields: def.searchQueryFields,
  });

  const promptRef = useRef(gen.prompt);
  promptRef.current = gen.prompt;
  const modeStateRef = useRef(modeState);
  modeStateRef.current = modeState;

  const onSubmit = useCallback(() => {
    const extraFields = def.buildSubmitFields
      ? def.buildSubmitFields(promptRef.current, modeStateRef.current)
      : def.promptField && def.promptField !== 'inhalt'
        ? { [def.promptField]: promptRef.current }
        : {};
    void gen.submit(extraFields);
    setShowResult(true);
  }, [def, gen.submit]);

  const handleCloseResult = useCallback(() => setShowResult(false), []);

  const toolbar = useMemo(
    () => (
      <ModeToolbar
        mode={def.id}
        state={modeState}
        onStateChange={updateField}
        attachedFiles={gen.attachedFiles}
        onAttachmentClick={gen.handleAttachmentClick}
        onRemoveFile={gen.handleRemoveFile}
        def={def}
      />
    ),
    [
      def.id,
      modeState,
      updateField,
      gen.attachedFiles,
      gen.handleAttachmentClick,
      gen.handleRemoveFile,
    ]
  );

  return (
    <>
      <ModeExtraFields mode={def.id} state={modeState} onChange={updateField} def={def} />
      <AIPromptInput
        value={gen.prompt}
        onChange={gen.setPrompt}
        onSubmit={onSubmit}
        isLoading={gen.isLoading || gen.isStreaming}
        error={gen.error}
        placeholder={def.placeholder}
        examples={def.examples}
        toolbar={toolbar}
      />
      <GeneratorOutput
        componentName={def.componentName}
        isOpen={showResult}
        onClose={handleCloseResult}
        useMarkdown={def.useMarkdown}
      />
    </>
  );
});

GeneratorInner.displayName = 'GeneratorInner';

export default GeneratorInner;
