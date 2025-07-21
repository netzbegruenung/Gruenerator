import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { IoDownloadOutline } from "react-icons/io5";
import { FaSpinner } from "react-icons/fa6";
import { extractFilenameFromContent } from '../utils/titleExtractor';

// === SHARED UTILITIES ===

// Helper function to process HTML content
const processContentForExport = (content) => {
  if (!content) return '';
  
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
    .replace(/<[^>]*>/g, '')
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
  const processedContent = processContentForExport(content);
  const sections = [];
  
  const paragraphs = processedContent.split(/\n\s*\n/);
  let currentSection = null;
  
  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();
    if (!trimmed) return;
    
    if (trimmed.length < 100 && (
      trimmed === trimmed.toUpperCase() ||
      trimmed.startsWith('Betreff:') ||
      trimmed.startsWith('Antragstext:') ||
      trimmed.startsWith('Begründung:') ||
      trimmed.match(/^[A-ZÄÖÜ][^:]*:?\s*$/)
    )) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        header: trimmed.replace(/:$/, ''),
        content: []
      };
    } else {
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

// Lazy load PDF renderer and create document
const loadPDFRenderer = async () => {
  const { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Font } = await import('@react-pdf/renderer');
  
  // Register custom fonts
  Font.register({
    family: 'PT Sans',
    fonts: [
      {
        src: '/src/assets/fonts/PTSans-Regular.woff',
        fontWeight: 'normal',
        fontStyle: 'normal'
      },
      {
        src: '/src/assets/fonts/PTSans-Bold.woff',
        fontWeight: 'bold',
        fontStyle: 'normal'
      },
      {
        src: '/src/assets/fonts/PTSans-Italic.woff',
        fontWeight: 'normal',
        fontStyle: 'italic'
      }
    ]
  });

  Font.register({
    family: 'GrueneType',
    src: '/src/assets/fonts/GrueneType.woff'
  });

  // PDF Styles
  const pdfStyles = StyleSheet.create({
    page: {
      flexDirection: 'column',
      backgroundColor: '#FFFFFF',
      padding: 40,
      fontSize: 12,
      lineHeight: 1.6,
      fontFamily: 'PT Sans',
      color: '#464646'
    },
    title: {
      fontSize: 20,
      marginBottom: 20,
      fontWeight: 'bold',
      textAlign: 'center',
      color: '#262626',
      fontFamily: 'GrueneType'
    },
    subtitle: {
      fontSize: 14,
      marginBottom: 10,
      marginTop: 15,
      fontWeight: 'bold',
      color: '#262626'
    },
    paragraph: {
      fontSize: 11,
      marginBottom: 8,
      textAlign: 'justify',
      lineHeight: 1.5
    },
    listItem: {
      fontSize: 11,
      marginBottom: 5,
      marginLeft: 20,
      lineHeight: 1.4
    },
    section: {
      marginBottom: 15
    },
    footer: {
      position: 'absolute',
      bottom: 30,
      left: 40,
      right: 40,
      textAlign: 'center',
      fontSize: 9,
      color: '#888888'
    }
  });

  // PDF Document Component
  const PDFDocumentComponent = ({ content, title = 'Dokument' }) => {
    const sections = parseContentSections(content);
    
    return (
      <Document>
        <Page size="A4" style={pdfStyles.page}>
          <Text style={pdfStyles.title}>{title}</Text>
          
          {sections.map((section, index) => (
            <View key={index} style={pdfStyles.section}>
              {section.header && (
                <Text style={pdfStyles.subtitle}>{section.header}</Text>
              )}
              {section.content.map((paragraph, pIndex) => {
                if (paragraph.startsWith('•') || paragraph.match(/^\d+\./)) {
                  return (
                    <Text key={pIndex} style={pdfStyles.listItem}>
                      {paragraph}
                    </Text>
                  );
                }
                return (
                  <Text key={pIndex} style={pdfStyles.paragraph}>
                    {paragraph}
                  </Text>
                );
              })}
            </View>
          ))}
          
          <Text style={pdfStyles.footer}>
            Erstellt mit Grünerator • {new Date().toLocaleDateString('de-DE')}
          </Text>
        </Page>
      </Document>
    );
  };

  return { PDFDocumentComponent, PDFDownloadLink };
};

// Lazy load DOCX library
const loadDOCXLibrary = async () => {
  const [docxModule, fileSaverModule] = await Promise.all([
    import('docx'),
    import('file-saver').catch(() => ({ saveAs: null }))
  ]);
  
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = docxModule;
  
  // Set up saveAs if available
  if (fileSaverModule.saveAs) {
    window.saveAs = fileSaverModule.saveAs;
  }

  // Download blob function
  const downloadBlob = (blob, filename) => {
    if (typeof window.saveAs === 'function') {
      window.saveAs(blob, filename);
    } else {
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
            size: 32,
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
      if (section.header) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: section.header,
                bold: true,
                size: 24,
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

      section.content.forEach((paragraph) => {
        if (paragraph.startsWith('•') || paragraph.match(/^\d+\./)) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph,
                  size: 22,
                  font: "PT Sans",
                }),
              ],
              spacing: {
                after: 100,
              },
              indent: {
                left: 360,
              },
            })
          );
        } else {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph,
                  size: 22,
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
            size: 18,
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

  return { createDOCXDocument, Packer, downloadBlob };
};

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