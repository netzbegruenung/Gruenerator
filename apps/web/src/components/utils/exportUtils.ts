// marked imported dynamically
import { isMarkdownContent } from '../common/Form/utils/contentUtils';

interface Source {
  title?: string;
  url?: string;
  summary?: string;
  [key: string]: unknown;
}

interface ExportContentParams {
  analysis: string;
  sourceRecommendations?: Source[];
  unusedSources?: Source[];
}

/**
 * Converts markdown to HTML if needed, otherwise returns original content
 * @param content - Content that may be markdown
 * @returns HTML content or original content if not markdown
 */
const processMarkdownContent = async (content: string | null | undefined): Promise<string> => {
  if (!content) return '';

  // Check if content is markdown
  if (typeof content === 'string' && isMarkdownContent(content)) {
    // Dynamically import marked
    const { marked } = await import('marked');

    // Convert markdown to HTML
    return marked(content, {
      breaks: true, // Convert line breaks to <br>
      gfm: true, // GitHub Flavored Markdown
    });
  }

  // Return original content if not markdown
  return content;
};

/**
 * Formatiert den Export-Content für Etherpad mit HTML
 */
export const formatExportContent = async ({
  analysis,
  sourceRecommendations = [],
  unusedSources = [],
}: ExportContentParams): Promise<string> => {
  // Hauptanalyse als HTML
  let content = analysis;

  // Convert markdown to HTML if needed using shared function
  content = await processMarkdownContent(content);

  // Stelle sicher, dass Zeilenumbrüche als <br> oder <p> Tags erhalten bleiben
  if (content) {
    // Temporär Listen schützen
    content = content
      // Schütze Listen
      .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (match) => {
        return match.replace(/\n/g, '{{NEWLINE}}');
      })
      .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (match) => {
        return match.replace(/\n/g, '{{NEWLINE}}');
      });

    // Konvertiere Überschriften in Etherpad-Format mit einer Leerzeile davor
    content = content
      .replace(/<h1[^>]*>(.*?)<\/h1>/g, '<p>&nbsp;</p><p><strong>$1</strong></p>')
      .replace(/<h2[^>]*>(.*?)<\/h2>/g, '<p>&nbsp;</p><p><strong>$1</strong></p>')
      .replace(/<h3[^>]*>(.*?)<\/h3>/g, '<p>&nbsp;</p><p><strong>$1</strong></p>')
      .replace(/<h4[^>]*>(.*?)<\/h4>/g, '<p>&nbsp;</p><p><strong>$1</strong></p>')
      .replace(/<h5[^>]*>(.*?)<\/h5>/g, '<p>&nbsp;</p><p><strong>$1</strong></p>')
      .replace(/<h6[^>]*>(.*?)<\/h6>/g, '<p>&nbsp;</p><p><strong>$1</strong></p>');

    // Ersetze Zeilenumbrüche und Abstände
    content = content
      // Entferne mehrfache Leerzeilen
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Ersetze einzelne Zeilenumbrüche durch <br>
      .replace(/(?:\r\n|\r|\n)/g, '<br>\n')
      // Ersetze doppelte <br> durch einen einzelnen Absatz
      .replace(/(<br>\n){2,}/g, '</p><p>')
      // Wickle den gesamten Content in <p> Tags wenn noch nicht vorhanden
      .replace(/^(?!<p>)(.+)$/s, '<p>$1</p>')
      // Entferne mehrfache Leerabsätze aggressiv
      .replace(/(<p>\s*(&nbsp;)?\s*<\/p>\s*){2,}/g, '<p>&nbsp;</p>');

    // Stelle geschützte Zeilenumbrüche wieder her
    content = content.replace(/{{NEWLINE}}/g, '\n');

    // Füge einzelne Abstände zwischen Blöcken hinzu
    content = content
      .replace(/<\/div><div/g, '</div><p>&nbsp;</p><div')
      .replace(/<\/ul><p>/g, '</ul><p>&nbsp;</p><p>')
      .replace(/<\/ol><p>/g, '</ol><p>&nbsp;</p><p>')
      // Entferne mehrfache Leerabsätze nochmal
      .replace(/(<p>\s*(&nbsp;)?\s*<\/p>\s*){2,}/g, '<p>&nbsp;</p>');
  }

  // Verwendete Quellen mit Links und Beschreibungen
  if (sourceRecommendations?.length > 0) {
    content += '<p>&nbsp;</p>';
    content += '<div class="sources-section">';
    content += '<p>&nbsp;</p><p><strong>QUELLEN</strong></p>';
    sourceRecommendations.forEach((source) => {
      const matchingSource = unusedSources.find((s) => s.title === source.title);
      content += '<div class="source-item">';
      content += `<p><strong>${source.title}</strong></p>`;
      if (matchingSource?.url) {
        content += `<p><a href="${matchingSource.url}">${matchingSource.url}</a></p>`;
      }
      content += `<p>${source.summary}</p>`;
      content += '</div>';
    });
    content += '</div>';
  }

  // Ergänzende Quellen (7-10)
  const additionalSources = unusedSources.slice(6);
  if (additionalSources.length > 0) {
    content += '<p>&nbsp;</p>';
    content += '<div class="additional-sources-section">';
    content += '<p>&nbsp;</p><p><strong>ERGÄNZENDE QUELLEN</strong></p>';
    additionalSources.forEach((source) => {
      content += '<div class="source-item">';
      content += `<p><strong>${source.title}</strong></p>`;
      content += `<p><a href="${source.url}">${source.url}</a></p>`;
      content += '</div>';
    });
    content += '</div>';
  }

  // Finale Bereinigung von mehrfachen Leerabsätzen
  content = content
    .replace(/(<p>\s*(&nbsp;)?\s*<\/p>\s*){2,}/g, '<p>&nbsp;</p>')
    // Entferne Leerzeilen am Anfang des Dokuments
    .replace(/^(<p>\s*(&nbsp;)?\s*<\/p>\s*)+/, '')
    // Entferne Leerzeilen am Ende des Dokuments
    .replace(/(<p>\s*(&nbsp;)?\s*<\/p>\s*)+$/, '');

  return content;
};
