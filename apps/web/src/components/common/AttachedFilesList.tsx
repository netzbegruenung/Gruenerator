import { HiX } from 'react-icons/hi';
import type { JSX } from 'react';
import { truncateWithSuffix } from '../../utils/textUtils';
import '../../assets/styles/components/ui/AttachedFilesList.css';

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
  compact = false
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
    <div className={`attached-files-list ${compact ? 'attached-files-list--compact' : ''} ${className}`}>
      {displayFiles.map((file, index) => {
        const metadata = fileMetadata[index] || {};
        const hasWarning = privacyModeActive && metadata.hasPrivacyConflict;

        // Build display name with page count
        // Calculate page count suffix first
        let pageSuffix = '';
        if (file.type === 'application/pdf' && metadata.pageCount !== undefined) {
          const pageCountText = metadata.pageCount !== null ? `${metadata.pageCount}S.` : '?S.';
          pageSuffix = ` (${pageCountText})`;
        }

        // Truncate filename accounting for the suffix length (max total length: 50 chars)
        const truncatedName = truncateWithSuffix(file.name, 50, pageSuffix);
        const displayName = truncatedName + pageSuffix;

        // Build tooltip text
        const tooltipText = hasWarning && metadata.conflictReason
          ? `${file.name} - ${metadata.conflictReason}`
          : file.name;

        return (
          <div
            key={`${file.name}-${index}`}
            className={`file-tag ${hasWarning ? 'file-tag--warning' : ''}`}
            title={tooltipText}
          >
            <span className="file-name">
              {displayName}
            </span>
            <button
              type="button"
              className="file-remove-btn"
              onClick={(e) => handleRemoveFile(index, e)}
              aria-label={`${file.name} entfernen`}
            >
              <HiX />
            </button>
          </div>
        );
      })}
      {hasMore && (
        <div className="attached-files-list__more">
          +{files.length - 5} weitere
        </div>
      )}
    </div>
  );
};

export default AttachedFilesList;
