import type { GeneratedContent } from '@/types/baseform';

interface BaseContainerClassesParams {
  title?: string;
  generatedContent?: GeneratedContent;
  isFormVisible?: boolean;
  isStartMode?: boolean;
  isGenerating?: boolean;
}

export function getBaseContainerClasses({
  title,
  generatedContent,
  isFormVisible,
  isStartMode,
  isGenerating,
}: BaseContainerClassesParams): string {
  const hasContent =
    generatedContent &&
    (typeof generatedContent === 'string'
      ? generatedContent.length > 0
      : ((generatedContent as { content?: string; sharepic?: unknown }).content?.length ?? 0) > 0 ||
        !!(generatedContent as { sharepic?: unknown }).sharepic);

  const classes = [
    'base-container',
    hasContent ? 'has-generated-content' : '',
    isStartMode ? 'base-container--start-mode' : '',
    !hasContent && !isStartMode && !isGenerating ? 'no-content-column' : '',
  ];
  return classes.filter(Boolean).join(' ');
}
