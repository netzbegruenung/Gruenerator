import React, { memo } from 'react';

import DisplaySection from '../../../components/common/ContentDisplay/DisplaySection';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';

import type { CustomExportOption, HelpContent } from '@/types/baseform';
import type { ReactNode } from 'react';

export interface GeneratorOutputProps {
  componentName: string;
  title?: string;
  useMarkdown?: boolean | null;
  helpContent?: HelpContent | null;
  customRenderer?:
    | ((props: {
        content: unknown;
        generatedContent: unknown;
        componentName: string;
        helpContent?: HelpContent | null;
        onEditModeToggle?: () => void;
      }) => ReactNode)
    | null;
  customExportOptions?: CustomExportOption[];
  hideDefaultExportOptions?: boolean;
  onReset?: () => void;
  onRegenerate?: () => void | Promise<void>;
}

const GeneratorOutput: React.FC<GeneratorOutputProps> = memo(
  ({
    componentName,
    title = 'Generierter Text',
    useMarkdown = true,
    helpContent,
    customRenderer,
    customExportOptions,
    hideDefaultExportOptions,
    onReset,
    onRegenerate,
  }) => {
    const hasContent = useGeneratedTextStore((state) => {
      const content = state.generatedTexts[componentName];
      if (!content) return false;
      if (typeof content === 'string') return content.trim().length > 0;
      return Object.keys(content).length > 0;
    });

    if (!hasContent) return null;

    return (
      <DisplaySection
        title={title}
        componentName={componentName}
        useMarkdown={useMarkdown}
        helpContent={helpContent}
        customRenderer={customRenderer}
        customExportOptions={customExportOptions}
        hideDefaultExportOptions={hideDefaultExportOptions}
        showResetButton={!!onReset}
        onReset={onReset}
        onGeneratePost={onRegenerate}
      />
    );
  }
);

GeneratorOutput.displayName = 'GeneratorOutput';

export default GeneratorOutput;
