import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { IoDownloadOutline } from "react-icons/io5";
import { FaSpinner } from "react-icons/fa6";
import { extractFilenameFromContent } from '../utils/titleExtractor';
import { loadPDFRenderer, loadDOCXLibrary } from './exportUtils.jsx';

// === MAIN COMPONENT ===
const DownloadExport = ({ content, title, className = 'action-button' }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  const [PDFLibrary, setPDFLibrary] = useState(null);
  const [DOCXLibrary, setDOCXLibrary] = useState(null);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [loadingDOCX, setLoadingDOCX] = useState(false);
  
  if (!content) {
    return null;
  }

  const isMobileView = window.innerWidth <= 768;
  
  const loadPDF = useCallback(async () => {
    if (PDFLibrary || loadingPDF) return;
    setLoadingPDF(true);
    try {
      const library = await loadPDFRenderer();
      setPDFLibrary(library);
    } catch (error) {
      console.error('Failed to load PDF library:', error);
    } finally {
      setLoadingPDF(false);
    }
  }, [PDFLibrary, loadingPDF]);

  const loadDOCX = useCallback(async () => {
    if (DOCXLibrary || loadingDOCX) return;
    setLoadingDOCX(true);
    try {
      const library = await loadDOCXLibrary();
      setDOCXLibrary(library);
    } catch (error) {
      console.error('Failed to load DOCX library:', error);
    } finally {
      setLoadingDOCX(false);
    }
  }, [DOCXLibrary, loadingDOCX]);

  const handleDOCXDownload = async () => {
    if (!DOCXLibrary) {
      await loadDOCX();
      return;
    }

    try {
      setIsGenerating(true);
      const { createDOCXDocument, Packer, downloadBlob } = DOCXLibrary;
      const baseFileName = extractFilenameFromContent(content, title);
      const fileName = `${baseFileName}.docx`;
      const doc = createDOCXDocument(content, title);
      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, fileName);
    } catch (error) {
      console.error('DOCX generation error:', error);
    } finally {
      setTimeout(() => setIsGenerating(false), 1000);
    }
  };

  const handlePDFDownload = async () => {
    if (!PDFLibrary) {
      await loadPDF();
      return;
    }

    try {
      setIsGenerating(true);
      const { PDFDocumentComponent, PDFDownloadLink } = PDFLibrary;
      
      // Create temporary PDF link and click it
      const tempDiv = document.createElement('div');
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);

      const React = await import('react');
      const ReactDOM = await import('react-dom/client');
      
      const root = ReactDOM.createRoot(tempDiv);
      
      root.render(
        React.createElement(PDFDownloadLink, {
          document: React.createElement(PDFDocumentComponent, { content, title }),
          fileName: `${extractFilenameFromContent(content, title)}.pdf`,
          style: { display: 'none' }
        }, ({ blob, url, loading, error }) => {
          if (!loading && !error && url) {
            // Trigger download
            const link = document.createElement('a');
            link.href = url;
            link.download = `${extractFilenameFromContent(content, title)}.pdf`;
            link.click();
          }
          return null;
        })
      );

      // Clean up
      setTimeout(() => {
        document.body.removeChild(tempDiv);
      }, 2000);

    } catch (error) {
      console.error('PDF generation error:', error);
    } finally {
      setTimeout(() => setIsGenerating(false), 1000);
    }
  };

  const handleDownloadClick = () => {
    setShowFormatSelector(!showFormatSelector);
  };

  const handleFormatSelect = (format) => {
    setShowFormatSelector(false);
    
    if (format === 'docx') {
      handleDOCXDownload();
    } else if (format === 'pdf') {
      handlePDFDownload();
    }
  };

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