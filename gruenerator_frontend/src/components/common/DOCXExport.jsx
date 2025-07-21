import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { IoDocumentTextOutline } from "react-icons/io5";
import { FaSpinner } from "react-icons/fa6";
import { extractFilenameFromContent } from '../utils/titleExtractor.js';

// Fallback for file-saver if not available
const downloadBlob = (blob, filename) => {
  // Try dynamic saveAs first, then fallback
  if (typeof window.saveAs === 'function') {
    window.saveAs(blob, filename);
  } else {
    // Manual download fallback
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
};

// Helper function to process HTML content for DOCX
const processContentForDOCX = (content) => {
  if (!content) return '';
  
  // Remove HTML tags and convert common formatting
  let processedContent = content
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '$1\n\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '$1')
    .replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1')
    .replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .trim();

  return processedContent;
};

// Parse content into structured sections
const parseContentSections = (content) => {
  const processedContent = processContentForDOCX(content);
  const sections = [];
  
  // Split by double newlines to get paragraphs
  const paragraphs = processedContent.split(/\n\s*\n/);
  
  let currentSection = null;
  
  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();
    if (!trimmed) return;
    
    // Check if this looks like a header (all caps, short, ends with colon, etc.)
    if (trimmed.length < 100 && (
      trimmed === trimmed.toUpperCase() ||
      trimmed.startsWith('Betreff:') ||
      trimmed.startsWith('Antragstext:') ||
      trimmed.startsWith('Begründung:') ||
      trimmed.match(/^[A-ZÄÖÜ][^:]*:?\s*$/)
    )) {
      // This is likely a section header
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        header: trimmed.replace(/:$/, ''),
        content: []
      };
    } else {
      // This is content
      if (!currentSection) {
        currentSection = {
          header: null,
          content: []
        };
      }
      currentSection.content.push(trimmed);
    }
  });
  
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
};

// Lazy load DOCX library and create document generator
const loadDOCXLibrary = async () => {
  const [docxModule, fileSaverModule] = await Promise.all([
    import('docx'),
    import('file-saver').catch(() => ({ saveAs: null })) // Graceful fallback if file-saver fails
  ]);
  
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = docxModule;
  
  // Set up saveAs if available
  if (fileSaverModule.saveAs) {
    window.saveAs = fileSaverModule.saveAs;
  }

  // Create DOCX document function
  const createDOCXDocument = (content, title = 'Dokument') => {
    const sections = parseContentSections(content);
    const children = [];

    // Add title
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 32, // 16pt
            font: "PT Sans",
          }),
        ],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: {
          after: 400,
        },
      })
    );

    // Add sections
    sections.forEach((section) => {
      // Add section header if exists
      if (section.header) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: section.header,
                bold: true,
                size: 24, // 12pt
                font: "PT Sans",
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: {
              before: 300,
              after: 200,
            },
          })
        );
      }

      // Add section content
      section.content.forEach((paragraph) => {
        // Check if paragraph contains bullet points
        if (paragraph.startsWith('•') || paragraph.match(/^\d+\./)) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph,
                  size: 22, // 11pt
                  font: "PT Sans",
                }),
              ],
              spacing: {
                after: 100,
              },
              indent: {
                left: 360, // Indent for list items
              },
            })
          );
        } else {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph,
                  size: 22, // 11pt
                  font: "PT Sans",
                }),
              ],
              spacing: {
                after: 200,
              },
              alignment: AlignmentType.JUSTIFIED,
            })
          );
        }
      });
    });

    // Add footer
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Erstellt mit Grünerator • ${new Date().toLocaleDateString('de-DE')}`,
            size: 18, // 9pt
            italics: true,
            color: "666666",
            font: "PT Sans",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: {
          before: 600,
        },
      })
    );

    return new Document({
      sections: [
        {
          properties: {},
          children: children,
        },
      ],
      title: title,
      creator: "Grünerator",
      description: "Generated document from Grünerator",
    });
  };

  return { createDOCXDocument, Packer };
};

const DOCXExport = ({ content, title, className = 'action-button' }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [DOCXLibrary, setDOCXLibrary] = useState(null);
  const [loadError, setLoadError] = useState(null);
  
  if (!content) {
    return null;
  }

  const baseFileName = extractFilenameFromContent(content, title);
  const fileName = `${baseFileName}.docx`;
  const isMobileView = window.innerWidth <= 768;
  
  const handleLoadDOCX = useCallback(async () => {
    if (DOCXLibrary || isLoading) return;
    
    setIsLoading(true);
    setLoadError(null);
    
    try {
      const library = await loadDOCXLibrary();
      setDOCXLibrary(library);
    } catch (error) {
      console.error('Failed to load DOCX library:', error);
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, [DOCXLibrary, isLoading]);
  
  const handleDOCXExport = async () => {
    if (!DOCXLibrary) {
      await handleLoadDOCX();
      return;
    }
    
    try {
      setIsGenerating(true);
      
      const { createDOCXDocument, Packer } = DOCXLibrary;
      
      // Create the DOCX document
      const doc = createDOCXDocument(content, title);
      
      // Generate the DOCX file
      const blob = await Packer.toBlob(doc);
      
      // Download the file
      downloadBlob(blob, fileName);
      
    } catch (error) {
      console.error('DOCX generation error:', error);
    } finally {
      setTimeout(() => setIsGenerating(false), 1000);
    }
  };

  // If DOCX library hasn't been loaded yet, show a button that loads it
  if (!DOCXLibrary && !loadError) {
    return (
      <button
        className={className}
        onClick={handleLoadDOCX}
        onMouseEnter={handleLoadDOCX}
        onFocus={handleLoadDOCX}
        disabled={isLoading}
        aria-label={isLoading ? "DOCX wird geladen..." : "Als DOCX herunterladen"}
        {...(!isMobileView && {
          'data-tooltip-id': "action-tooltip",
          'data-tooltip-content': isLoading ? "DOCX wird geladen..." : "Als DOCX herunterladen"
        })}
      >
        {isLoading ? <FaSpinner className="spinning" size={16} /> : <IoDocumentTextOutline size={16} />}
      </button>
    );
  }

  // If there was a loading error, show a disabled button
  if (loadError) {
    return (
      <button
        className={className}
        disabled
        aria-label="DOCX-Export nicht verfügbar"
        {...(!isMobileView && {
          'data-tooltip-id': "action-tooltip",
          'data-tooltip-content': "DOCX-Export temporär nicht verfügbar"
        })}
        style={{ opacity: 0.5 }}
      >
        <IoDocumentTextOutline size={16} />
      </button>
    );
  }

  // Once DOCX library is loaded, show the export button
  return (
    <button
      className={className}
      onClick={handleDOCXExport}
      disabled={isGenerating}
      aria-label={isGenerating ? "DOCX wird erstellt..." : "Als DOCX herunterladen"}
      {...(!isMobileView && {
        'data-tooltip-id': "action-tooltip",
        'data-tooltip-content': isGenerating ? "DOCX wird erstellt..." : "Als DOCX herunterladen"
      })}
    >
      {isGenerating ? <FaSpinner className="spinning" size={16} /> : <IoDocumentTextOutline size={16} />}
    </button>
  );
};

DOCXExport.propTypes = {
  content: PropTypes.string.isRequired,
  title: PropTypes.string,
  className: PropTypes.string
};

export default DOCXExport;