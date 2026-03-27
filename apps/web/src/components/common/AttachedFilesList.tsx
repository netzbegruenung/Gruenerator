import { HiX } from 'react-icons/hi';

import { truncateWithSuffix } from '../../utils/textUtils';
import { cn } from '../../utils/cn';

import type { JSX } from 'react';

interface AttachedFile {
  name: string;
  type?: string;
  size?: number;
}

interface FileMetadata {
  pageCount?: number | null;
  hasPrivacyConflict?: boolean;
  conflictReason?: string;
}

interface AttachedFilesListProps {
  files?: AttachedFile[];
  onRemoveFile?: (index: number) => void;
  className?: string;
  fileMetadata?: Record<number, FileMetadata>;
  privacyModeActive?: boolean;
  compact?: boolean;
}

const AttachedFilesList = ({
  files = [],
  onRemoveFile,
  className = '',
  fileMetadata = {},
  privacyModeActive = false,
  compact = false,
}: AttachedFilesListProps): JSX.Element | null => {
  if (!files || files.length === 0) {
    return null;
  }

  const handleRemoveFile = (index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    if (onRemoveFile) {
      onRemoveFile(index);
    }
  };

  // In compact mode, limit to 5 files with scroll
  const displayFiles = compact ? files.slice(0, 5) : files;
  const hasMore = compact && files.length > 5;

  return (
    <div
      className={cn(
        'flex flex-wrap gap-xs my-sm w-full',
        compact && 'mt-0 max-h-[120px] overflow-y-auto overflow-x-hidden gap-xxs',
        className
      )}
    >
      {displayFiles.map((file, index) => {
        const metadata = fileMetadata[index] || {};
        const hasWarning = privacyModeActive && metadata.hasPrivacyConflict;

        // Build display name with page count
        let pageSuffix = '';
        if (file.type === 'application/pdf' && metadata.pageCount !== undefined) {
          const pageCountText = metadata.pageCount !== null ? `${metadata.pageCount}S.` : '?S.';
          pageSuffix = ` (${pageCountText})`;
        }

        // Truncate filename accounting for the suffix length (max total length: 50 chars)
        const truncatedName = truncateWithSuffix(file.name, 50, pageSuffix);
        const displayName = truncatedName + pageSuffix;

        // Build tooltip text
        const tooltipText =
          hasWarning && metadata.conflictReason
            ? `${file.name} - ${metadata.conflictReason}`
            : file.name;

        return (
          <div
            key={`${file.name}-${index}`}
            className={cn(
              'inline-flex items-center px-xs py-xxs bg-[var(--secondary-50)] border border-[var(--secondary-200)] rounded-[var(--card-border-radius-small)] text-[0.8rem] max-w-full min-w-0 shrink',
              'dark:bg-grey-700 dark:border-grey-600',
              compact && 'text-[0.75rem] px-xxs py-1 max-w-full',
              hasWarning && 'border-[var(--error-500)]! bg-[rgba(211,47,47,0.05)] dark:bg-[rgba(211,47,47,0.1)] dark:border-[var(--error-400)]!',
              'max-sm:text-[0.75rem] max-sm:px-xxs max-sm:max-w-[calc(100vw-2*var(--spacing-medium))]',
              'sm:max-md:max-w-[calc(50vw-var(--spacing-small))]',
              'md:max-w-[300px]'
            )}
            title={tooltipText}
          >
            <span
              className={cn(
                'flex-1 min-w-0 block text-foreground overflow-hidden text-ellipsis whitespace-nowrap',
                hasWarning && 'text-[var(--error-700)]! dark:text-[var(--error-300)]!'
              )}
            >
              {displayName}
            </span>
            <button
              type="button"
              className={cn(
                'ml-xxs p-0 bg-none border-none cursor-pointer text-[var(--error-500)] flex items-center justify-center w-4 h-4 rounded-full transition-all shrink-0 min-w-[16px]',
                'hover:bg-[var(--error-50)] dark:hover:bg-grey-600',
                'max-sm:w-[18px] max-sm:h-[18px] max-sm:min-w-[18px]',
                hasWarning && 'text-[var(--error-600)] hover:bg-[var(--error-100)] hover:text-[var(--error-700)] dark:text-[var(--error-400)] dark:hover:bg-[var(--error-900)] dark:hover:text-[var(--error-300)]'
              )}
              onClick={(e: React.MouseEvent) => handleRemoveFile(index, e)}
              aria-label={`${file.name} entfernen`}
            >
              <HiX />
            </button>
          </div>
        );
      })}
      {hasMore && (
        <div className="inline-flex items-center px-xs py-1 bg-[var(--secondary-100)] dark:bg-grey-600 rounded-[var(--card-border-radius-small)] text-[0.7rem] text-foreground opacity-70 font-medium">
          +{files.length - 5} weitere
        </div>
      )}
    </div>
  );
};

export default AttachedFilesList;
