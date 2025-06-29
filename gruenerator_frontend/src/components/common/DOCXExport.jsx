import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoDocumentTextOutline } from "react-icons/io5";
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from 'docx';
import { saveAs } from 'file-saver';

// Fallback for file-saver if not available
const downloadBlob = (blob, filename) => {
  if (typeof saveAs === 'function') {
    saveAs(blob, filename);
  } else {
    // Fallback method
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

// Create DOCX document
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

const DOCXExport = ({ content, title, className = 'action-button' }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  
  if (!content) {
    return null;
  }

  const fileName = `${title || 'Dokument'}.docx`;
  const isMobileView = window.innerWidth <= 768;
  
  const handleDOCXExport = async () => {
    try {
      setIsGenerating(true);
      
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

  return (
    <button
      className={className}
      onClick={handleDOCXExport}
      disabled={isGenerating}
      aria-label="Als DOCX herunterladen"
      {...(!isMobileView && {
        'data-tooltip-id': "action-tooltip",
        'data-tooltip-content': "Als DOCX herunterladen"
      })}
    >
      <IoDocumentTextOutline size={16} />
    </button>
  );
};

DOCXExport.propTypes = {
  content: PropTypes.string.isRequired,
  title: PropTypes.string,
  className: PropTypes.string
};

export default DOCXExport;