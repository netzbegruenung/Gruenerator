import type { GeneratedContent } from '@/types/baseform';

interface BaseContainerClassesParams {
  title?: string;
  generatedContent?: GeneratedContent;
  isFormVisible?: boolean;
  isEditModeActive?: boolean;
  isStartMode?: boolean;
}

export function getBaseContainerClasses({
  title,
  generatedContent,
  isFormVisible,
  isEditModeActive,
  isStartMode
}: BaseContainerClassesParams): string {
  const classes = [
    'base-container',
    generatedContent && (
      typeof generatedContent === 'string'
        ? generatedContent.length > 0
        : (generatedContent as { content?: string; sharepic?: unknown }).content?.length > 0 || (generatedContent as { sharepic?: unknown }).sharepic
    ) ? 'has-generated-content' : '',
    isEditModeActive ? 'edit-mode-active' : '',
    isStartMode ? 'base-container--start-mode' : ''
  ];
  return classes.filter(Boolean).join(' ');
}
