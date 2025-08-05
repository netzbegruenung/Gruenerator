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

// Lazy load PDF renderer and create document
export const loadPDFRenderer = async () => {
  const { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Font } = await import('@react-pdf/renderer');
  
  // Register custom fonts
  registerFonts(Font);

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