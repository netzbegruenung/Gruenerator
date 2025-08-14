// === SHARED EXPORT UTILITIES ===

// Helper function to process HTML content for export
export const processContentForExport = (content) => {
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

// Lazy load PDF library and create document using pdf-lib (much lighter than @react-pdf/renderer)
export const loadPDFRenderer = async () => {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  
  // PDF generation function using pdf-lib
  const generatePDFBuffer = async (content, title = 'Dokument') => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    
    // Load standard fonts
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const subtitleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    const { width, height } = page.getSize();
    const margin = 40;
    let currentY = height - margin;
    
    // Colors (converted to RGB)
    const titleColor = rgb(0.15, 0.15, 0.15); // #262626
    const subtitleColor = rgb(0.15, 0.15, 0.15); // #262626
    const bodyColor = rgb(0.27, 0.27, 0.27); // #464646
    const footerColor = rgb(0.53, 0.53, 0.53); // #888888
    
    // Title
    const titleSize = 20;
    const titleWidth = titleFont.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (width - titleWidth) / 2, // Center align
      y: currentY,
      size: titleSize,
      font: titleFont,
      color: titleColor,
    });
    currentY -= 40; // Title margin bottom
    
    // Parse content sections
    const sections = parseContentSections(content);
    
    // Process sections
    for (const section of sections) {
      // Section header
      if (section.header && currentY > margin + 50) {
        const subtitleSize = 14;
        page.drawText(section.header, {
          x: margin,
          y: currentY,
          size: subtitleSize,
          font: subtitleFont,
          color: subtitleColor,
        });
        currentY -= 25; // Subtitle margin
      }
      
      // Section content
      for (const paragraph of section.content) {
        if (currentY < margin + 50) {
          // Add new page if needed
          const newPage = pdfDoc.addPage([595.28, 841.89]);
          currentY = height - margin;
          // Continue with new page logic if needed
          break;
        }
        
        const fontSize = 11;
        const lineHeight = fontSize * 1.5;
        const maxWidth = width - (margin * 2);
        
        // Handle list items
        const isListItem = paragraph.startsWith('•') || paragraph.match(/^\d+\./);
        const textX = isListItem ? margin + 20 : margin;
        const availableWidth = isListItem ? maxWidth - 20 : maxWidth;
        
        // Simple text wrapping
        const words = paragraph.split(' ');
        let currentLine = '';
        const lines = [];
        
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testWidth = bodyFont.widthOfTextAtSize(testLine, fontSize);
          
          if (testWidth <= availableWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) lines.push(currentLine);
        
        // Draw lines
        for (const line of lines) {
          page.drawText(line, {
            x: textX,
            y: currentY,
            size: fontSize,
            font: bodyFont,
            color: bodyColor,
          });
          currentY -= lineHeight;
        }
        
        currentY -= 8; // Paragraph margin
      }
      
      currentY -= 15; // Section margin
    }
    
    // Footer
    const footerText = `Erstellt mit Grünerator • ${new Date().toLocaleDateString('de-DE')}`;
    const footerSize = 9;
    const footerWidth = bodyFont.widthOfTextAtSize(footerText, footerSize);
    page.drawText(footerText, {
      x: (width - footerWidth) / 2,
      y: 30,
      size: footerSize,
      font: bodyFont,
      color: footerColor,
    });
    
    return await pdfDoc.save();
  };

  return { generatePDFBuffer };
};

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

// Lazy load DOCX library
export const loadDOCXLibrary = async () => {
  const [docxModule, fileSaverModule] = await Promise.all([
    import('docx'),
    import('file-saver').catch(() => ({ saveAs: null }))
  ]);
  
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = docxModule;
  
  // Set up saveAs if available
  if (fileSaverModule.saveAs) {
    window.saveAs = fileSaverModule.saveAs;
  }

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
            text: `Erstellt mit dem Grünerator von Moritz Wächter • ${new Date().toLocaleDateString('de-DE')}`,
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