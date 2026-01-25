/**
 * Citation parsing utilities for document exports
 * Handles citation markers and sources section generation
 */

import type { CitationSegment, Citation } from './types.js';

/**
 * Parse citation markers (⚡CITE1⚡, ⚡CITE2⚡, etc.) from text
 */
export function parseCitationMarkers(text: string | null | undefined): CitationSegment[] {
  if (!text || typeof text !== 'string') {
    return [{ text: text || '', isCitation: false }];
  }

  const citationPattern = /⚡CITE(\d+)⚡/g;
  const segments: CitationSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore) {
        segments.push({ text: textBefore, isCitation: false });
      }
    }

    segments.push({
      text: `[${match[1]}]`,
      isCitation: true,
      citationIndex: match[1],
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      segments.push({ text: remainingText, isCitation: false });
    }
  }

  return segments.length === 0 ? [{ text, isCitation: false }] : segments;
}

/**
 * Create academic-style sources section for DOCX
 * @param docxLib - The docx library module
 * @param citations - Array of citations
 */
export function createSourcesSection(docxLib: any, citations: Citation[]): any[] {
  if (!citations || citations.length === 0) return [];

  const { Paragraph, TextRun, HeadingLevel } = docxLib;
  const children: any[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'Quellen', bold: true, size: 26, font: 'GrueneTypeNeue' })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 600, after: 200 },
    })
  );

  const sortedCitations = [...citations].sort((a, b) => parseInt(a.index) - parseInt(b.index));

  for (const citation of sortedCitations) {
    const relevancePercent = citation.similarity_score
      ? Math.round(citation.similarity_score * 100)
      : null;

    const citedTextPreview = citation.cited_text
      ? citation.cited_text.length > 150
        ? citation.cited_text.substring(0, 150) + '...'
        : citation.cited_text
      : '';

    const textRuns = [
      new TextRun({ text: `${citation.index}. `, bold: true, size: 20, font: 'PT Sans' }),
      new TextRun({
        text: citation.document_title || 'Unbekannte Quelle',
        bold: true,
        size: 20,
        font: 'PT Sans',
      }),
    ];

    if (citedTextPreview) {
      textRuns.push(new TextRun({ text: ', ', size: 20, font: 'PT Sans' }));
      textRuns.push(
        new TextRun({ text: `„${citedTextPreview}"`, italics: true, size: 20, font: 'PT Sans' })
      );
    }

    if (relevancePercent) {
      textRuns.push(
        new TextRun({
          text: ` (Relevanz: ${relevancePercent}%)`,
          size: 18,
          color: '666666',
          font: 'PT Sans',
        })
      );
    }

    children.push(
      new Paragraph({
        children: textRuns,
        spacing: { after: 120 },
        indent: { left: 360 },
      })
    );

    if (citation.source_url) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: '→ ', size: 18, color: '666666', font: 'PT Sans' }),
            new TextRun({ text: citation.source_url, size: 18, color: '0066cc', font: 'PT Sans' }),
          ],
          spacing: { after: 80 },
          indent: { left: 720 },
        })
      );
    }
  }

  return children;
}
