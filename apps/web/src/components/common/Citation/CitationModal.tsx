import { useRef, useEffect, type JSX, type MouseEvent } from 'react';

import useCitationStore from '../../../stores/citationStore';
import { cn } from '../../../utils/cn';
import { Markdown } from '../Markdown';

import '../../../assets/styles/common/markdown-styles.css';

const CitationModal = (): JSX.Element | null => {
  const modalRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);

  const { selectedCitation, closeCitationModal, contextData, isLoadingContext, contextError } =
    useCitationStore();

  useEffect(() => {
    if (contextData && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [contextData]);

  if (!selectedCitation) return null;

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeCitationModal();
    }
  };

  const renderContextView = () => {
    if (isLoadingContext) {
      return (
        <div className="flex items-center justify-center gap-sm p-lg text-disabled text-[clamp(0.9rem,1.5vw,1rem)] min-h-[100px] max-sm:p-xl max-sm:text-base">
          <span className="size-5 border-2 border-grey-200 dark:border-grey-700 border-t-accent rounded-full animate-spin shrink-0 max-sm:size-6 max-sm:border-[3px]" />
          <span>Kontext wird geladen...</span>
        </div>
      );
    }

    if (contextError) {
      return (
        <div className="text-foreground italic leading-[1.6] p-md rounded-sm bg-background-alt text-[clamp(0.9rem,1.5vw,1rem)] max-sm:p-md max-sm:text-base max-sm:leading-[1.7]">
          &ldquo;{selectedCitation.cited_text}&rdquo;
        </div>
      );
    }

    if (contextData && contextData.contextChunks && contextData.contextChunks.length > 0) {
      return (
        <div className="citation-context-view markdown-content">
          {contextData.contextChunks.map((chunk, idx) => (
            <span
              key={`chunk-${chunk.chunkIndex}-${idx}`}
              ref={chunk.isCenter ? highlightRef : null}
              className={chunk.isCenter ? 'citation-highlight' : 'text-foreground opacity-70'}
            >
              <Markdown>{chunk.text}</Markdown>{' '}
            </span>
          ))}
        </div>
      );
    }

    return (
      <div
        className={cn(
          'text-foreground italic leading-[1.6] p-md rounded-sm bg-background-alt text-[clamp(0.9rem,1.5vw,1rem)]',
          'max-sm:p-md max-sm:text-base max-sm:leading-[1.7]',
          'markdown-content'
        )}
      >
        &ldquo;<Markdown>{selectedCitation.cited_text || ''}</Markdown>&rdquo;
      </div>
    );
  };

  return (
    <div
      className={cn(
        'fixed inset-0 bg-overlay-sm flex items-center justify-center z-[1100] p-md',
        'max-sm:p-sm max-sm:items-end',
        'max-[399px]:p-0',
        'md:max-lg:p-lg',
        'lg:p-xl'
      )}
      onClick={handleOverlayClick}
    >
      <div
        className={cn(
          'bg-background-pure rounded-md shadow-card-floating border border-grey-200 dark:border-grey-700',
          'w-[90%] max-w-[800px] max-h-[85vh] overflow-hidden flex flex-col',
          'animate-[modalSlideIn_0.2s_ease-out]',
          'max-sm:w-full max-sm:max-w-none max-sm:max-h-[92vh] max-sm:rounded-t-lg max-sm:rounded-b-none max-sm:mb-0',
          'max-[399px]:max-h-[95vh] max-[399px]:rounded-t-md max-[399px]:rounded-b-none',
          'md:max-lg:w-[85%] md:max-lg:max-w-[700px]',
          'lg:w-[70%] lg:max-w-[900px]',
          'min-[1440px]:w-[65%] min-[1440px]:max-w-[1000px]'
        )}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            'flex justify-between items-center p-[var(--spacing-large)_var(--spacing-xlarge)] border-b border-grey-200 dark:border-grey-700 shrink-0',
            'max-sm:p-[var(--spacing-medium)_var(--spacing-medium)_var(--spacing-medium)_var(--spacing-large)]',
            'max-[399px]:p-[var(--spacing-small)_var(--spacing-small)_var(--spacing-small)_var(--spacing-medium)]',
            'lg:p-[var(--spacing-medium)_var(--spacing-xxlarge)]'
          )}
        >
          <h4 className="m-0 text-foreground-heading text-[clamp(1.1rem,2vw,1.35rem)] font-semibold max-sm:text-[1.1rem]">
            Zitat [{selectedCitation.index}]
          </h4>
          <button
            className={cn(
              'bg-transparent border-none text-[1.75rem] text-foreground cursor-pointer p-xs rounded-sm',
              'transition-all duration-200 leading-none size-11 flex items-center justify-center shrink-0',
              'hover:bg-background-alt hover:text-accent',
              'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
              'max-sm:size-12 max-sm:text-[2rem]'
            )}
            onClick={closeCitationModal}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div
          className={cn(
            'p-[var(--spacing-medium)_var(--spacing-xlarge)] overflow-y-auto flex-1 min-h-0',
            'max-sm:p-[var(--spacing-medium)_var(--spacing-large)]',
            'max-[399px]:p-[var(--spacing-small)_var(--spacing-medium)]',
            'lg:p-[var(--spacing-large)_var(--spacing-xxlarge)]'
          )}
        >
          {renderContextView()}
        </div>
        <div
          className={cn(
            'flex items-center justify-between gap-md p-[var(--spacing-small)_var(--spacing-xlarge)]',
            'border-t border-grey-200 dark:border-grey-700 bg-background-alt shrink-0',
            'max-sm:p-[var(--spacing-small)_var(--spacing-medium)] max-sm:gap-sm',
            'max-[399px]:p-[var(--spacing-xsmall)_var(--spacing-small)] max-[399px]:flex-wrap',
            'lg:p-[var(--spacing-small)_var(--spacing-xxlarge)]'
          )}
        >
          <div
            className={cn('flex items-center gap-sm flex-1 min-w-0', 'max-[399px]:flex-[1_1_100%]')}
          >
            <span className="text-foreground-heading text-[0.9rem] font-medium whitespace-nowrap overflow-hidden text-ellipsis max-sm:text-[0.85rem]">
              {selectedCitation.document_title}
            </span>
            {selectedCitation.similarity_score && (
              <span className="text-disabled text-[0.8rem] bg-background-pure py-0.5 px-2 rounded-[10px] shrink-0 max-sm:text-[0.75rem] max-sm:py-0.5 max-sm:px-1.5">
                {Math.round(Number(selectedCitation.similarity_score) * 100)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CitationModal;
