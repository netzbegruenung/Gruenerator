const express = require('express');
const router = express.Router();
const { markdownForExport, isMarkdownContent } = require('../utils/markdownService');
const { sanitizeFilename: sanitizeFilenameCentral } = require('../utils/securityUtils');
const { PRIMARY_DOMAIN } = require('../utils/domainUtils.js');
const path = require('path');
const fs = require('fs').promises;
const { createLogger } = require('../utils/logger.js');
const log = createLogger('exportDocuments');


// Parse content with formatting information preserved
function parseFormattedContent(input) {
  if (!input) return [];

  let content = String(input);

  // First check if this is markdown and convert it
  if (isMarkdownContent(content)) {
    content = markdownForExport(content);
  }

  // Convert basic HTML entities
  content = content
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');

  // Parse paragraphs and headers separately
  const elements = [];
  const regex = /<(h[1-6]|p|div|section|article)[^>]*>(.*?)<\/\1>/gi;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    const innerContent = match[2].trim();

    if (!innerContent) continue;

    // Check if this is a header tag
    const isHeader = /^h[1-6]$/.test(tag);
    const headerLevel = isHeader ? parseInt(tag[1]) : null;

    elements.push({
      content: innerContent,
      isHeader,
      headerLevel,
      tag
    });
  }

  // If no elements were found, try splitting by tags
  if (elements.length === 0) {
    const paragraphs = content
      .split(/<\/(h[1-6]|p|div|section|article)>/gi)
      .map(para => {
        const headerMatch = para.match(/^<(h[1-6])[^>]*>(.*)/i);
        if (headerMatch) {
          return {
            content: headerMatch[2].trim(),
            isHeader: true,
            headerLevel: parseInt(headerMatch[1][1]),
            tag: headerMatch[1].toLowerCase()
          };
        }

        para = para.replace(/^<(h[1-6]|p|div|section|article)[^>]*>/gi, '');
        para = para.replace(/<\/(h[1-6]|p|div|section|article)>/gi, '');
        para = para.replace(/^<p>$/gi, '').replace(/^<\/p>$/gi, '');
        para = para.trim();

        if (!para || para === 'p' || para === '/p') return null;

        return {
          content: para,
          isHeader: false,
          headerLevel: null,
          tag: 'p'
        };
      })
      .filter(el => el !== null);

    elements.push(...paragraphs);
  }

  return elements.map(element => {
    const segments = parseFormattedParagraph(element.content);
    return {
      segments,
      isHeader: element.isHeader,
      headerLevel: element.headerLevel
    };
  });
}

// Parse a single paragraph and return an array of formatted segments
function parseFormattedParagraph(text) {
  const segments = [];
  let currentIndex = 0;
  
  // Handle line breaks
  text = text.replace(/<br\s*\/?>(\s*)/gi, '\n');
  
  // Handle list items
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n');
  text = text.replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1');
  text = text.replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1');
  
  // Regular expressions for formatting
  const patterns = [
    // HTML tags
    { regex: /<strong[^>]*>(.*?)<\/strong>/gi, bold: true, italic: false },
    { regex: /<b[^>]*>(.*?)<\/b>/gi, bold: true, italic: false },
    { regex: /<em[^>]*>(.*?)<\/em>/gi, bold: false, italic: true },
    { regex: /<i[^>]*>(.*?)<\/i>/gi, bold: false, italic: true },
    // Markdown patterns
    { regex: /\*\*\*(.*?)\*\*\*/g, bold: true, italic: true }, // ***bold italic***
    { regex: /\*\*(.*?)\*\*/g, bold: true, italic: false },     // **bold**
    { regex: /\*(.*?)\*/g, bold: false, italic: true },         // *italic*
    { regex: /___(.*?)___/g, bold: true, italic: true },        // ___bold italic___
    { regex: /__(.*?)__/g, bold: true, italic: false },         // __bold__
    { regex: /_(.*?)_/g, bold: false, italic: true }            // _italic_
  ];
  
  let workingText = text;
  const foundFormatting = [];
  
  // Find all formatting matches
  patterns.forEach(pattern => {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags); // Create fresh regex to avoid state issues
    while ((match = regex.exec(text)) !== null) {
      foundFormatting.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        bold: pattern.bold,
        italic: pattern.italic,
        fullMatch: match[0]
      });
      
      // Prevent infinite loops with zero-width matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  });
  
  // Sort by start position
  foundFormatting.sort((a, b) => a.start - b.start);
  
  // Build segments
  let lastEnd = 0;
  
  foundFormatting.forEach(format => {
    // Add text before this formatting
    if (format.start > lastEnd) {
      const beforeText = text.substring(lastEnd, format.start);
      if (beforeText.trim()) {
        segments.push({
          text: beforeText,
          bold: false,
          italic: false
        });
      }
    }
    
    // Add formatted text
    segments.push({
      text: format.content,
      bold: format.bold,
      italic: format.italic
    });
    
    lastEnd = format.end;
  });
  
  // Add remaining text
  if (lastEnd < text.length) {
    const remainingText = text.substring(lastEnd);
    if (remainingText.trim()) {
      segments.push({
        text: remainingText,
        bold: false,
        italic: false
      });
    }
  }
  
  // If no formatting was found, return the whole text as one segment
  if (segments.length === 0) {
    // Remove any remaining HTML tags
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    if (cleanText) {
      segments.push({
        text: cleanText,
        bold: false,
        italic: false
      });
    }
  }
  
  // Clean up any remaining HTML tags from all segments
  return segments.map(segment => ({
    ...segment,
    text: segment.text.replace(/<[^>]*>/g, '').trim()
  })).filter(segment => segment.text.length > 0);
}

function htmlToPlainText(html) {
  if (!html) return '';

  let text = String(html);

  // Convert line breaks to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');

  // Convert list items
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<\/li>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Convert HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');

  return text.trim();
}

function parseSections(plain) {
  const paragraphs = (plain || '').split(/\n\s*\n/);
  const sections = [];
  let current = null;
  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    if (p.length < 100 && (p === p.toUpperCase() || /^.+:\s*$/.test(p))) {
      if (current) sections.push(current);
      current = { header: p.replace(/:$/, ''), content: [] };
    } else {
      if (!current) current = { header: null, content: [] };
      current.content.push(p);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function sanitizeFilename(name, fallback = 'Dokument') {
  // Use centralized security utility for consistent sanitization
  const sanitized = sanitizeFilenameCentral(name, fallback);
  // Apply document-specific length limit (80 chars for export filenames)
  return sanitized.slice(0, 80) || fallback;
}

// POST /api/exports/pdf
router.post('/pdf', async (req, res) => {
  try {
    const { content, title } = req.body || {};
    const plain = htmlToPlainText(content);
    const sections = parseSections(plain);

    // Lazy import to avoid hard dependency on startup
    const { PDFDocument, rgb } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const margin = 40;
    let y = height - margin;

    // Embed custom fonts
    const fontsDir = path.join(__dirname, '..', 'public', 'fonts');
    const grueneTypeBytes = await fs.readFile(path.join(fontsDir, 'GrueneTypeNeue-Regular.ttf'));
    const ptSansRegularBytes = await fs.readFile(path.join(fontsDir, 'PTSans-Regular.ttf'));

    const titleFont = await pdfDoc.embedFont(grueneTypeBytes);
    const bodyFont = await pdfDoc.embedFont(ptSansRegularBytes);

    // Title
    const docTitle = title || 'Dokument';
    const titleSize = 20;
    const titleWidth = titleFont.widthOfTextAtSize(docTitle, titleSize);
    page.drawText(docTitle, {
      x: (width - titleWidth) / 2,
      y,
      size: titleSize,
      font: titleFont,
      color: rgb(0.15, 0.15, 0.15)
    });
    y -= 40;

    const drawParagraph = (text, isList = false) => {
      const fontSize = 11;
      const lineHeight = fontSize * 1.5;
      const maxWidth = width - margin * 2 - (isList ? 20 : 0);
      const x = margin + (isList ? 20 : 0);
      const words = text.split(' ');
      let line = '';
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        const testWidth = bodyFont.widthOfTextAtSize(test, fontSize);
        if (testWidth <= maxWidth) {
          line = test;
        } else {
          if (y < margin + 50) {
            page = pdfDoc.addPage([595.28, 841.89]);
            y = height - margin;
          }
          page.drawText(line, { x, y, size: fontSize, font: bodyFont, color: rgb(0.27, 0.27, 0.27) });
          y -= lineHeight;
          line = w;
        }
      }
      if (line) {
        if (y < margin + 50) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = height - margin;
        }
        page.drawText(line, { x, y, size: fontSize, font: bodyFont, color: rgb(0.27, 0.27, 0.27) });
        y -= lineHeight;
      }
      y -= 8;
    };

    // Sections
    for (const sec of sections) {
      if (sec.header) {
        if (y < margin + 50) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = height - margin;
        }
        page.drawText(sec.header, { x: margin, y, size: 14, font: titleFont, color: rgb(0.15, 0.15, 0.15) });
        y -= 25;
      }
      for (const para of sec.content) {
        const isList = para.startsWith('•') || /^\d+\./.test(para);
        drawParagraph(para, isList);
      }
      y -= 8;
    }

    const bytes = await pdfDoc.save();
    const filename = `${sanitizeFilename(title || 'Dokument')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(Buffer.from(bytes));
  } catch (err) {
    log.error('[exportDocuments] PDF export error:', err);
    return res.status(500).json({ success: false, message: 'PDF export failed', error: err.message });
  }
});

// POST /api/exports/docx
router.post('/docx', async (req, res) => {
  try {
    const { content, title } = req.body || {};
    const formattedParagraphs = parseFormattedContent(content);

    const docx = await import('docx');
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = docx;

    const children = [];
    const docTitle = title || 'Dokument';
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: docTitle, bold: true, size: 32, font: 'GrueneTypeNeue' }),
        ],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    // Process each paragraph with its formatting
    for (const paragraph of formattedParagraphs) {
      if (!paragraph.segments || paragraph.segments.length === 0) continue;

      const fullText = paragraph.segments.map(seg => seg.text).join('');

      if (paragraph.isHeader) {
        // Create header paragraph based on header level
        const textRuns = paragraph.segments.map(segment =>
          new TextRun({
            text: segment.text,
            bold: true,
            italics: segment.italic,
            size: paragraph.headerLevel === 1 ? 28 : paragraph.headerLevel === 2 ? 26 : 24,
            font: 'GrueneTypeNeue'
          })
        );

        const headingLevel = paragraph.headerLevel === 1 ? HeadingLevel.HEADING_1 :
                           paragraph.headerLevel === 2 ? HeadingLevel.HEADING_2 :
                           HeadingLevel.HEADING_3;

        children.push(new Paragraph({
          children: textRuns,
          heading: headingLevel,
          spacing: { before: 300, after: 200 },
        }));
      } else {
        // Create regular paragraph with formatting
        const textRuns = paragraph.segments.map(segment =>
          new TextRun({
            text: segment.text,
            bold: segment.bold,
            italics: segment.italic,
            size: 22,
            font: 'PT Sans'
          })
        );

        const isList = fullText.startsWith('•') || /^\d+\./.test(fullText);

        children.push(new Paragraph({
          children: textRuns,
          spacing: { after: isList ? 100 : 200 },
          alignment: isList ? undefined : AlignmentType.JUSTIFIED,
          indent: isList ? { left: 360 } : undefined,
        }));
      }
    }

    children.push(new Paragraph({
      children: [
        new TextRun({ text: `Erstellt mit dem Grünerator von Moritz Wächter • ${new Date().toLocaleDateString('de-DE')} • `, size: 18, italics: true, color: '666666', font: 'PT Sans' }),
        new TextRun({ text: PRIMARY_DOMAIN, size: 18, italics: true, color: '0066cc', style: 'Hyperlink', font: 'PT Sans' })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
    }));

    const doc = new Document({
      sections: [{ properties: {}, children }],
      title: docTitle,
      creator: 'Grünerator',
      description: 'Generated document from Grünerator',
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${sanitizeFilename(title || 'Dokument')}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err) {
    log.error('[exportDocuments] DOCX export error:', err);
    return res.status(500).json({ success: false, message: 'DOCX export failed', error: err.message });
  }
});

module.exports = router;

