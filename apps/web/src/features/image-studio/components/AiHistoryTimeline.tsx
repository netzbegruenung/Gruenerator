import React from 'react';

import useImageStudioStore from '../../../stores/imageStudioStore';
import { cn } from '../../../utils/cn';

/**
 * Visual timeline showing AI generation history
 * Displays thumbnails and prompts for each generation with navigation
 */
export const AiHistoryTimeline: React.FC = () => {
  const { aiEditorHistory, aiEditorHistoryIndex, loadHistoryEntry } = useImageStudioStore();

  if (aiEditorHistory.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-sm p-sm px-md bg-background-alt rounded-md mt-md overflow-x-auto">
      <div className="text-xs font-semibold text-grey-500 whitespace-nowrap mr-xs">History:</div>
      <div className="flex gap-xs flex-1 overflow-x-auto py-xxs">
        {aiEditorHistory.map((entry, index) => (
          <div
            key={entry.id}
            className={cn(
              'relative flex flex-col items-center gap-xxs cursor-pointer transition-transform duration-200 shrink-0 hover:scale-105',
              index > aiEditorHistoryIndex && 'opacity-50'
            )}
            onClick={() => loadHistoryEntry(index)}
            title={`${entry.prompt.substring(0, 50)}${entry.prompt.length > 50 ? '...' : ''}`}
          >
            <div
              className={cn(
                'w-[60px] h-[60px] rounded-sm overflow-hidden border-2 border-transparent transition-colors duration-200 bg-background md:w-[50px] md:h-[50px]',
                index === aiEditorHistoryIndex &&
                  'border-[var(--tanne)] shadow-[0_0_0_2px_var(--tanne-light)]',
                index > aiEditorHistoryIndex && 'grayscale-[50%]'
              )}
            >
              <img
                src={entry.generatedImage}
                alt={`Generation ${index + 1}`}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
            <div
              className={cn(
                'text-[var(--font-size-xsmall)] text-grey-500 font-medium',
                index === aiEditorHistoryIndex && 'text-[var(--tanne)] font-semibold'
              )}
            >
              #{index + 1}
            </div>
            {index === aiEditorHistoryIndex && (
              <div className="absolute -top-1.5 -right-1.5 text-[var(--tanne)] bg-background rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AiHistoryTimeline;
