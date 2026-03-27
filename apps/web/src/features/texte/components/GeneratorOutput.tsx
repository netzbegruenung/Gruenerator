import React, { memo } from 'react';

import useGeneratedTextStore from '../../../stores/core/generatedTextStore';

import TextResultScreen from './TextResultScreen';

export interface GeneratorOutputProps {
  componentName: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  useMarkdown?: boolean | null;
}

const GeneratorOutput: React.FC<GeneratorOutputProps> = memo(
  ({ componentName, isOpen, onClose, title = 'Generierter Text', useMarkdown = true }) => {
    const hasContent = useGeneratedTextStore((state) => {
      const content = state.generatedTexts[componentName];
      if (!content) return false;
      if (typeof content === 'string') return content.trim().length > 0;
      return Object.keys(content).length > 0;
    });

    if (!hasContent || !isOpen) return null;

    return (
      <TextResultScreen
        isOpen
        onClose={onClose}
        componentName={componentName}
        title={title}
        useMarkdown={useMarkdown}
      />
    );
  }
);

GeneratorOutput.displayName = 'GeneratorOutput';

export default GeneratorOutput;
