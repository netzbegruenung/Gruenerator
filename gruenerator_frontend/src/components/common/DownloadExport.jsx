import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { IoDownloadOutline } from "react-icons/io5";
import { FaSpinner } from "react-icons/fa6";
import { useExportStore } from '../../stores/core/exportStore';

// === MAIN COMPONENT ===
const DownloadExport = ({ content, title, className = 'action-button' }) => {
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  
  // Use export store for state and actions
  const {
    isGenerating,
    loadingPDF,
    loadingDOCX,
    loadPDFLibrary,
    loadDOCXLibrary,
    generatePDF,
    generateDOCX
  } = useExportStore();
  
  if (!content) {
    return null;
  }

  const isMobileView = window.innerWidth <= 768;
  
  const handleDOCXDownload = useCallback(async () => {
    try {
      await generateDOCX(content, title);
    } catch (error) {
      console.error('DOCX download failed:', error);
    }
  }, [generateDOCX, content, title]);

  const handlePDFDownload = useCallback(async () => {
    try {
      await generatePDF(content, title);
    } catch (error) {
      console.error('PDF download failed:', error);
    }
  }, [generatePDF, content, title]);

  const loadPDF = useCallback(async () => {
    try {
      await loadPDFLibrary();
    } catch (error) {
      console.error('Failed to load PDF library:', error);
    }
  }, [loadPDFLibrary]);

  const loadDOCX = useCallback(async () => {
    try {
      await loadDOCXLibrary();
    } catch (error) {
      console.error('Failed to load DOCX library:', error);
    }
  }, [loadDOCXLibrary]);

  const handleDownloadClick = () => {
    setShowFormatSelector(!showFormatSelector);
  };

  const handleFormatSelect = useCallback((format) => {
    setShowFormatSelector(false);
    
    if (format === 'docx') {
      handleDOCXDownload();
    } else if (format === 'pdf') {
      handlePDFDownload();
    }
  }, [handleDOCXDownload, handlePDFDownload]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFormatSelector && !event.target.closest('.download-export')) {
        setShowFormatSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFormatSelector]);

  return (
    <div className="download-export">
      <button
        className={className}
        onClick={handleDownloadClick}
        disabled={isGenerating}
        aria-label="Herunterladen"
        {...(!isMobileView && {
          'data-tooltip-id': "action-tooltip",
          'data-tooltip-content': "Herunterladen"
        })}
      >
        {isGenerating ? <FaSpinner className="spinning" size={16} /> : <IoDownloadOutline size={16} />}
      </button>

      {showFormatSelector && (
        <div className="format-dropdown">
          <button
            className="format-option"
            onClick={() => handleFormatSelect('pdf')}
            disabled={isGenerating}
          >
            {loadingPDF ? <FaSpinner className="spinning" size={12} /> : 'PDF'}
          </button>
          <button
            className="format-option"
            onClick={() => handleFormatSelect('docx')}
            disabled={isGenerating}
          >
            {loadingDOCX ? <FaSpinner className="spinning" size={12} /> : 'DOCX'}
          </button>
        </div>
      )}
    </div>
  );
};

DownloadExport.propTypes = {
  content: PropTypes.string.isRequired,
  title: PropTypes.string,
  className: PropTypes.string
};

export default DownloadExport;