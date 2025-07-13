import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoDownloadOutline } from "react-icons/io5";

// PDF imports
import { Document as PDFDocument, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { PDFDownloadLink } from '@react-pdf/renderer';

// DOCX imports
import { Document as DOCXDocument, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from 'docx';
import { saveAs } from 'file-saver';
import { extractFilenameFromContent } from '../utils/titleExtractor';

// === PDF SETUP ===
// Register custom fonts for PDF
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

// === PDF COMPONENTS ===
const PDFDocumentComponent = ({ content, title = 'Dokument' }) => {
  const sections = parseContentSections(content);
  
  return (
    <PDFDocument>
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
    </PDFDocument>
  );
};

// === DOCX FUNCTIONS ===
const downloadBlob = (blob, filename) => {
  if (typeof saveAs === 'function') {
    saveAs(blob, filename);
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

  return new DOCXDocument({
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

// === MAIN COMPONENT ===
const DownloadExport = ({ content, title, className = 'action-button' }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [shouldInitializePDF, setShouldInitializePDF] = useState(false);
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  
  if (!content) {
    return null;
  }

  // fileName will be generated dynamically when format is selected
  const isMobileView = window.innerWidth <= 768;
  
  const handleDOCXDownload = async () => {
    try {
      setIsGenerating(true);
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
  
  const handlePDFDownload = () => {
    setShouldInitializePDF(true);
    
    setTimeout(() => {
      // Trigger PDF download after initialization
      const pdfLink = document.querySelector('.pdf-download-link');
      if (pdfLink) {
        pdfLink.click();
      }
      // Clean up after download
      setTimeout(() => {
        setShouldInitializePDF(false);
      }, 1000);
    }, 100);
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

  // Hidden PDF Download Link for when PDF is selected
  const pdfDownloadLink = shouldInitializePDF ? (
    <PDFDownloadLink
      document={<PDFDocumentComponent content={content} title={title} />}
      fileName={`${extractFilenameFromContent(content, title)}.pdf`}
      style={{ display: 'none' }}
      className="pdf-download-link"
    >
      {({ blob, url, loading, error }) => {
        return <span />;
      }}
    </PDFDownloadLink>
  ) : null;

  return (
    <div className="download-export">
      {pdfDownloadLink}
      
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
        <IoDownloadOutline size={16} />
      </button>

      {showFormatSelector && (
        <div className="format-dropdown">
          <button
            className="format-option"
            onClick={() => handleFormatSelect('pdf')}
            disabled={isGenerating}
          >
            PDF
          </button>
          <button
            className="format-option"
            onClick={() => handleFormatSelect('docx')}
            disabled={isGenerating}
          >
            DOCX
          </button>
        </div>
      )}
    </div>
  );
};

PDFDocumentComponent.propTypes = {
  content: PropTypes.string.isRequired,
  title: PropTypes.string
};

DownloadExport.propTypes = {
  content: PropTypes.string.isRequired,
  title: PropTypes.string,
  className: PropTypes.string
};

export default DownloadExport;