import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { FaRegFilePdf } from "react-icons/fa6";
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Font } from '@react-pdf/renderer';

// Register custom fonts matching the typography system
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

// PDF Styles matching the design system
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 40,
    fontSize: 12,
    lineHeight: 1.6,
    fontFamily: 'PT Sans',
    color: '#464646' // --font-color (grey-800)
  },
  title: {
    fontSize: 20,
    marginBottom: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#262626', // --anthrazit (grey-950)
    fontFamily: 'GrueneType'
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 15,
    marginTop: 15,
    fontWeight: 'bold',
    color: '#262626', // --anthrazit (grey-950)
    fontFamily: 'GrueneType'
  },
  paragraph: {
    marginBottom: 10,
    textAlign: 'justify',
    lineHeight: 1.8,
    fontFamily: 'PT Sans',
    color: '#464646' // --font-color (grey-800)
  },
  listItem: {
    marginBottom: 8,
    marginLeft: 15,
    lineHeight: 1.6,
    fontFamily: 'PT Sans',
    color: '#464646' // --font-color (grey-800)
  },
  section: {
    marginBottom: 15
  },
  header: {
    fontSize: 14,
    marginBottom: 5,
    fontWeight: 'bold',
    fontFamily: 'GrueneType',
    color: '#262626' // --anthrazit (grey-950)
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 10,
    color: '#7c7c7c', // --grey-500
    fontFamily: 'PT Sans'
  }
});

// Convert HTML/Markdown content to PDF-compatible format
const processContentForPDF = (content) => {
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
  const processedContent = processContentForPDF(content);
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

// PDF Document Component
const PDFDocument = ({ content, title = 'Dokument' }) => {
  const sections = parseContentSections(content);
  
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        
        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            {section.header && (
              <Text style={styles.subtitle}>{section.header}</Text>
            )}
            {section.content.map((paragraph, pIndex) => {
              // Check if paragraph contains bullet points
              if (paragraph.startsWith('•') || paragraph.match(/^\d+\./)) {
                return (
                  <Text key={pIndex} style={styles.listItem}>
                    {paragraph}
                  </Text>
                );
              }
              return (
                <Text key={pIndex} style={styles.paragraph}>
                  {paragraph}
                </Text>
              );
            })}
          </View>
        ))}
        
        <Text style={styles.footer}>
          Erstellt mit Grünerator • {new Date().toLocaleDateString('de-DE')}
        </Text>
      </Page>
    </Document>
  );
};

const PDFExport = ({ content, title, className = 'action-button' }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [shouldInitializePDF, setShouldInitializePDF] = useState(false);
  
  if (!content) {
    return null;
  }

  const fileName = `${title || 'Dokument'}.pdf`;
  const isMobileView = window.innerWidth <= 768;
  
  const handleInitializePDF = () => {
    if (!shouldInitializePDF) {
      setShouldInitializePDF(true);
    }
  };

  // If PDF hasn't been initialized yet, show a placeholder button
  if (!shouldInitializePDF) {
    return (
      <button
        className={className}
        onClick={handleInitializePDF}
        onMouseEnter={handleInitializePDF}
        onFocus={handleInitializePDF}
        aria-label="Als PDF herunterladen"
        {...(!isMobileView && {
          'data-tooltip-id': "action-tooltip",
          'data-tooltip-content': "Als PDF herunterladen"
        })}
      >
        <FaRegFilePdf size={16} />
      </button>
    );
  }
  
  // Wrap PDFDownloadLink with error boundary
  try {
    return (
      <PDFDownloadLink
        document={<PDFDocument content={content} title={title} />}
        fileName={fileName}
        style={{ textDecoration: 'none' }}
      >
        {({ blob, url, loading, error }) => {
          // If there's a PDF generation error, show a fallback button
          if (error) {
            console.error('PDF generation error:', error);
            return (
              <button
                className={className}
                disabled
                aria-label="PDF-Export nicht verfügbar"
                {...(!isMobileView && {
                  'data-tooltip-id': "action-tooltip",
                  'data-tooltip-content': "PDF-Export temporär nicht verfügbar"
                })}
                style={{ opacity: 0.5 }}
              >
                <FaRegFilePdf size={16} />
              </button>
            );
          }

          return (
            <button
              className={className}
              disabled={loading || isGenerating}
              aria-label="Als PDF herunterladen"
              {...(!isMobileView && {
                'data-tooltip-id': "action-tooltip",
                'data-tooltip-content': "Als PDF herunterladen"
              })}
              onClick={() => {
                if (!loading && !error) {
                  setIsGenerating(true);
                  // Reset generating state after a short delay
                  setTimeout(() => setIsGenerating(false), 1000);
                }
              }}
            >
              <FaRegFilePdf size={16} />
            </button>
          );
        }}
      </PDFDownloadLink>
    );
  } catch (pdfError) {
    console.error('PDFDownloadLink initialization error:', pdfError);
    // Return a disabled button as fallback
    return (
      <button
        className={className}
        disabled
        aria-label="PDF-Export nicht verfügbar"
        {...(!isMobileView && {
          'data-tooltip-id': "action-tooltip",
          'data-tooltip-content': "PDF-Export temporär nicht verfügbar"
        })}
        style={{ opacity: 0.5 }}
      >
        <FaRegFilePdf size={16} />
      </button>
    );
  }
};

PDFDocument.propTypes = {
  content: PropTypes.string.isRequired,
  title: PropTypes.string
};

PDFExport.propTypes = {
  content: PropTypes.string.isRequired,
  title: PropTypes.string,
  className: PropTypes.string
};

export default PDFExport;