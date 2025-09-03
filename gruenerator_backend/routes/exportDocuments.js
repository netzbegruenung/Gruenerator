const express = require('express');
const router = express.Router();

// Simple HTML to text processor (keep parity with frontend basics)
function htmlToPlainText(input) {
  if (!input) return '';
  let text = String(input);
  // Basic markdown detection removed; assume content already preprocessed to HTML/text on client
  // Replace common block tags with newlines
  text = text
    .replace(/<\/(h[1-6]|p|div|section|article)>/gi, '\n\n')
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1')
    .replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
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
    const plain = htmlToPlainText(content);
    const sections = parseSections(plain);

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

    for (const sec of sections) {
      if (sec.header) {
        children.push(new Paragraph({
          children: [ new TextRun({ text: sec.header, bold: true, size: 24 }) ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 200 },
        }));
      }
      for (const para of sec.content) {
        const isList = para.startsWith('•') || /^\d+\./.test(para);
        children.push(new Paragraph({
          children: [ new TextRun({ text: para, size: 22 }) ],
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

