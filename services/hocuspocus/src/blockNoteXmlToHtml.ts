import { createLogger } from './logger.js';

const log = createLogger('XmlToHtml');

/**
 * Convert BlockNote's Y.js XML fragment to simple HTML.
 *
 * BlockNote uses ProseMirror custom element names:
 *   <blockGroup><blockContainer><heading level="1">text</heading></blockContainer>
 *   <blockContainer><paragraph>text</paragraph></blockContainer></blockGroup>
 *
 * This converts them to standard HTML tags that browsers can style natively.
 *
 * Note: Y.js XmlElement.toString() outputs attributes in alphabetical order,
 * so `level` may not be the first attribute on <heading> elements. The regex
 * uses [^>]* before `level` to handle any preceding attributes.
 */
export function blockNoteXmlToHtml(xml: string): string {
  let html = xml;

  // Strip wrapper elements (may have attributes like id, blockColor)
  html = html.replace(/<\/?blockGroup[^>]*>/g, '');
  html = html.replace(/<\/?blockContainer[^>]*>/g, '');

  // Convert block elements
  html = html.replace(
    /<heading\s[^>]*level="(\d)"[^>]*>([\s\S]*?)<\/heading>/g,
    (_, level, content) => `<h${level}>${content}</h${level}>`
  );
  html = html.replace(/<paragraph[^>]*>([\s\S]*?)<\/paragraph>/g, '<p>$1</p>');
  html = html.replace(
    /<bulletListItem[^>]*>([\s\S]*?)<\/bulletListItem>/g,
    '<li data-list="ul">$1</li>'
  );
  html = html.replace(
    /<numberedListItem[^>]*>([\s\S]*?)<\/numberedListItem>/g,
    '<li data-list="ol">$1</li>'
  );

  // Convert inline marks
  html = html.replace(/<bold[^>]*>([\s\S]*?)<\/bold>/g, '<strong>$1</strong>');
  html = html.replace(/<italic[^>]*>([\s\S]*?)<\/italic>/g, '<em>$1</em>');
  html = html.replace(/<underline[^>]*>([\s\S]*?)<\/underline>/g, '<u>$1</u>');
  html = html.replace(/<strike[^>]*>([\s\S]*?)<\/strike>/g, '<s>$1</s>');

  // Group consecutive bullet list items into <ul>
  html = html.replace(
    /(<li data-list="ul">[\s\S]*?<\/li>\s*)+/g,
    (match) => `<ul>${match.replace(/ data-list="ul"/g, '')}</ul>`
  );
  // Group consecutive numbered list items into <ol>
  html = html.replace(
    /(<li data-list="ol">[\s\S]*?<\/li>\s*)+/g,
    (match) => `<ol>${match.replace(/ data-list="ol"/g, '')}</ol>`
  );

  // Clean up whitespace
  html = html.replace(/\s+/g, ' ').trim();

  // Diagnostic logging
  const headingCount = (html.match(/<h[123][^>]*>/g) || []).length;
  const unconverted = (html.match(/<heading[\s>]/g) || []).length;
  if (headingCount > 0) {
    log.debug(`[XmlToHtml] Converted ${headingCount} heading(s)`);
  }
  if (unconverted > 0) {
    log.warn(`[XmlToHtml] ${unconverted} unconverted <heading> tag(s) remain`);
  }

  return html;
}
