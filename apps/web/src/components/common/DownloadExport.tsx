import React, { useState, useCallback } from 'react';
import { HiRefresh } from 'react-icons/hi';
import { IoDownloadOutline } from 'react-icons/io5';

import { useExportStore } from '../../stores/core/exportStore';
import { extractFormattedText } from '../utils/contentExtractor';

// === MAIN COMPONENT ===
interface DownloadExportProps {
  content: unknown;
  title?: string;
  className?: string;
}

const DownloadExport = ({ content, title, className = 'action-button' }: DownloadExportProps) => {
  const [showFormatSelector, setShowFormatSelector] = useState(false);

  // Use export store for state and actions
  const {
    isGenerating,
    // loadingPDF, // Temporarily disabled
    // loadingDOCX, // handled via isGenerating
    // loadPDFLibrary, // Temporarily disabled
    generateDOCX,
  } = useExportStore();

  // All hooks must be called unconditionally before any early returns
  const handleDOCXDownload = useCallback(async () => {
    if (!content) return;
    try {
      // Preprocess content to ensure consistent formatting for export
      const formattedContent = await extractFormattedText(content);
      await generateDOCX(formattedContent, title || 'Download');
    } catch (error) {
      console.error('DOCX download failed:', error);
    }
  }, [generateDOCX, content, title]);

  const handleFormatSelect = useCallback(
    (format: 'docx' | 'pdf') => {
      setShowFormatSelector(false);

      if (format === 'docx') {
        handleDOCXDownload();
      } else if (format === 'pdf') {
        // PDF export temporarily disabled
        console.warn('PDF export is temporarily disabled');
      }
    },
    [handleDOCXDownload]
  );

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showFormatSelector && !(event.target as HTMLElement).closest('.download-export')) {
        setShowFormatSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFormatSelector]);

  // Early return after all hooks
  if (!content) {
    return null;
  }

  const isMobileView = window.innerWidth <= 768;

  const handleDownloadClick = () => {
    setShowFormatSelector(!showFormatSelector);
  };

  return (
    <div className="download-export">
      <button
        className={className}
        onClick={handleDownloadClick}
        disabled={isGenerating}
        aria-label="Herunterladen"
        {...(!isMobileView && {
          'data-tooltip-id': 'action-tooltip',
          'data-tooltip-content': 'Herunterladen',
        })}
      >
        {isGenerating ? (
          <HiRefresh className="spinning" size={16} />
        ) : (
          <IoDownloadOutline size={16} />
        )}
      </button>

      {showFormatSelector && (
        <div className="format-dropdown">
          {/* PDF option temporarily hidden */}
          {/* <button
            className="format-option"
            onClick={() => handleFormatSelect('pdf')}
            disabled={isGenerating}
          >
            PDF
          </button> */}
          <button
            className="format-option"
            onClick={() => handleFormatSelect('docx')}
            disabled={isGenerating}
          >
            {isGenerating ? <HiRefresh className="spinning" size={12} /> : 'DOCX'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DownloadExport;
