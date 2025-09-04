const express = require('express');
const router = express.Router();
const { markdownForExport, isMarkdownContent } = require('../utils/markdownService');

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
  
  // Split by paragraphs, preserving formatting within each paragraph
  const paragraphs = content
    .split(/<\/(h[1-6]|p|div|section|article)>/gi)
    .map(para => {
      // Remove opening tags
      para = para.replace(/^<(h[1-6]|p|div|section|article)[^>]*>/gi, '');
      // Remove any stray closing tags that might be left
      para = para.replace(/<\/(h[1-6]|p|div|section|article)>/gi, '');
      // Remove standalone paragraph tags
      para = para.replace(/^<p>$/gi, '').replace(/^<\/p>$/gi, '');
      return para.trim();
    })
    .filter(para => para.length > 0 && para !== 'p' && para !== '/p');
  
  return paragraphs.map(paragraph => {
    // Parse each paragraph for formatting
    return parseFormattedParagraph(paragraph.trim());
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
  const base = (name || fallback).toString().trim() || fallback;
  return base
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9_\-\u00C0-\u017F\s]/g, '')
    .trim()
    .slice(0, 80) || fallback;
}

// POST /api/exports/pdf
router.post('/pdf', async (req, res) => {
  try {
    const { content, title } = req.body || {};
    const plain = htmlToPlainText(content);
    const sections = parseSections(plain);

    // Lazy import to avoid hard dependency on startup
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const margin = 40;
    let y = height - margin;

    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

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
    console.error('[exportDocuments] PDF export error:', err);
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
          new TextRun({ text: docTitle, bold: true, size: 32 }),
        ],
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    // Process each paragraph with its formatting
    for (const paragraphSegments of formattedParagraphs) {
      if (paragraphSegments.length === 0) continue;
      
      // Check if this paragraph looks like a header (short text, all caps, or ends with colon)
      const fullText = paragraphSegments.map(seg => seg.text).join('');
      const isHeader = fullText.length < 100 && (fullText === fullText.toUpperCase() || /^.+:\s*$/.test(fullText));
      
      if (isHeader) {
        // Create header paragraph
        const textRuns = paragraphSegments.map(segment => 
          new TextRun({ 
            text: segment.text, 
            bold: true, // Headers are always bold
            italics: segment.italic,
            size: 24 
          })
        );
        
        children.push(new Paragraph({
          children: textRuns,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 200 },
        }));
      } else {
        // Create regular paragraph with formatting
        const textRuns = paragraphSegments.map(segment => 
          new TextRun({ 
            text: segment.text, 
            bold: segment.bold,
            italics: segment.italic,
            size: 22 
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
      children: [ new TextRun({ text: `Erstellt mit Grünerator • ${new Date().toLocaleDateString('de-DE')}`, size: 18, italics: true, color: '666666' }) ],
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
    console.error('[exportDocuments] DOCX export error:', err);
    return res.status(500).json({ success: false, message: 'DOCX export failed', error: err.message });
  }
});

module.exports = router;

