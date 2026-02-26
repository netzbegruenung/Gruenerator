import { describe, expect, it, vi } from 'vitest';

// Mock the markdown service — marked converts markdown to HTML
vi.mock('../../services/markdown/index.js', () => ({
  isMarkdownContent: (s: string) => /[#*\-]/.test(s),
  markdownForExport: (md: string) => {
    // Simplified marked-like conversion for testing
    let html = md;
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Bullet lists: consecutive lines starting with "- "
    html = html.replace(/((?:^- .+\n?)+)/gm, (match) => {
      const items = match
        .trim()
        .split('\n')
        .map((line) => `<li>${line.replace(/^- /, '')}</li>`)
        .join('\n');
      return `<ul>\n${items}\n</ul>`;
    });
    // Paragraphs: wrap remaining non-tag lines
    html = html
      .split('\n\n')
      .map((block) => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('<')) return trimmed;
        return `<p>${trimmed}</p>`;
      })
      .join('\n');
    return html;
  },
}));

import { parseFormattedContent, parseFormattedParagraph } from './contentParser.js';

describe('parseFormattedParagraph', () => {
  it('converts list items to bullet points', () => {
    const html = '<ul><li>Relevanz: 87%</li><li>Quelle: Grundsatzprogramm</li></ul>';
    const segments = parseFormattedParagraph(html);
    const text = segments.map((s) => s.text).join(' ');
    expect(text).toContain('Relevanz: 87%');
    expect(text).toContain('Quelle: Grundsatzprogramm');
  });

  it('handles multiline list items', () => {
    const html = '<ul>\n<li>First item\nwith continuation</li>\n<li>Second item</li>\n</ul>';
    const segments = parseFormattedParagraph(html);
    const text = segments.map((s) => s.text).join(' ');
    expect(text).toContain('First item');
    expect(text).toContain('Second item');
  });

  it('handles bold and italic within list items', () => {
    const html = '<ul><li><strong>Bold item</strong></li><li><em>Italic item</em></li></ul>';
    const segments = parseFormattedParagraph(html);
    const boldSegment = segments.find((s) => s.bold);
    expect(boldSegment?.text).toBe('Bold item');
  });
});

describe('parseFormattedContent', () => {
  it('preserves ul elements alongside paragraphs', () => {
    const html =
      '<p>Introduction paragraph</p>' +
      '<ul><li>Item one</li><li>Item two</li></ul>' +
      '<p>Conclusion paragraph</p>';

    const result = parseFormattedContent(html);
    const allText = result.map((p) => p.segments.map((s) => s.text).join(' ')).join(' | ');

    expect(allText).toContain('Introduction paragraph');
    expect(allText).toContain('Item one');
    expect(allText).toContain('Item two');
    expect(allText).toContain('Conclusion paragraph');
  });

  it('handles ul elements with multiline content', () => {
    const html = '<ul>\n<li>Relevanz: 87%</li>\n<li>Quelle: Grundsatzprogramm</li>\n</ul>';
    const result = parseFormattedContent(html);

    expect(result.length).toBeGreaterThan(0);
    const allText = result.map((p) => p.segments.map((s) => s.text).join(' ')).join(' | ');
    expect(allText).toContain('Relevanz: 87%');
    expect(allText).toContain('Grundsatzprogramm');
  });

  it('handles ordered lists', () => {
    const html = '<ol><li>First source</li><li>Second source</li></ol>';
    const result = parseFormattedContent(html);

    expect(result.length).toBeGreaterThan(0);
    const allText = result.map((p) => p.segments.map((s) => s.text).join(' ')).join(' | ');
    expect(allText).toContain('First source');
    expect(allText).toContain('Second source');
  });

  it('preserves headers mixed with lists', () => {
    const html =
      '<h2>Verwendete Argumente</h2>' +
      '<h3>1. Grundsatzprogramm</h3>' +
      '<ul><li>Relevanz: 90%</li><li>Auszug: Klimaschutz braucht...</li></ul>' +
      '<h3>2. KommunalWiki</h3>' +
      '<ul><li>Relevanz: 75%</li></ul>';

    const result = parseFormattedContent(html);
    const headers = result.filter((p) => p.isHeader);
    const nonHeaders = result.filter((p) => !p.isHeader);

    expect(headers.length).toBe(3); // h2 + 2x h3
    expect(nonHeaders.length).toBe(2); // 2x ul
  });

  it('handles markdown input with bullet lists via mock conversion', () => {
    const markdown = `## Verwendete Argumente

### 1. Grundsatzprogramm

- Relevanz: 87%
- Quelle: Grundsatzprogramm
- Auszug: Artenschutz ist wichtig`;

    const result = parseFormattedContent(markdown);
    const allText = result.map((p) => p.segments.map((s) => s.text).join(' ')).join(' | ');

    expect(allText).toContain('Verwendete Argumente');
    expect(allText).toContain('Relevanz: 87%');
    expect(allText).toContain('Grundsatzprogramm');
    expect(allText).toContain('Artenschutz ist wichtig');
  });

  it('returns empty array for null/undefined input', () => {
    expect(parseFormattedContent(null)).toEqual([]);
    expect(parseFormattedContent(undefined)).toEqual([]);
    expect(parseFormattedContent('')).toEqual([]);
  });
});
