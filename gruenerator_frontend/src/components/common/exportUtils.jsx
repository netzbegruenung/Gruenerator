// === SHARED EXPORT UTILITIES ===

// marked imported dynamically
import { isMarkdownContent } from './Form/utils/contentUtils';

/**
 * Converts markdown to HTML if needed, otherwise returns original content
 * This is the central function for all export features to handle markdown
 * @param {string} content - Content that may be markdown
 * @returns {Promise<string>} HTML content or original content if not markdown
 */
export const processMarkdownContent = async (content) => {
  if (!content) return '';
  
  // Check if content is markdown
  if (typeof content === 'string' && isMarkdownContent(content)) {
    // Dynamically import marked
    const { marked } = await import('marked');
    
    // Convert markdown to HTML
    return marked(content, {
      breaks: true,      // Convert line breaks to <br>
      gfm: true,        // GitHub Flavored Markdown
      headerIds: false, // Don't add IDs to headers
      mangle: false     // Don't mangle autolinks
    });
  }
  
  // Return original content if not markdown
  return content;
};

// Helper function to process HTML content for export
export const processContentForExport = (content) => {
  if (!content) return '';
  
  // Convert markdown to HTML first if needed
  content = processMarkdownContent(content);
  
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
export const parseContentSections = (content) => {
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

// Common font configuration for exports
const registerFonts = (Font) => {
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
};

// DEPRECATED: PDF generation moved to backend at /api/exports/pdf
// Use the exportStore.generatePDF() method instead

// Download blob fallback function
export const downloadBlob = (blob, filename) => {
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

// DEPRECATED: DOCX generation moved to backend at /api/exports/docx
// Use the exportStore.generateDOCX() method instead