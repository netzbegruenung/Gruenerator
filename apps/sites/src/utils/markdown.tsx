/**
 * Simple markdown to HTML converter for basic formatting.
 * Handles: bold, italic, underline, links, lists, and paragraphs.
 */
export function renderMarkdown(markdown: string): string {
  if (!markdown) return '';

  let html = markdown
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Links: [text](url)
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    // Headings: ## text or ### text
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>');

  // Handle unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Handle ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Convert double newlines to paragraph breaks
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs
    .map((p) => {
      p = p.trim();
      if (!p) return '';
      // Don't wrap if already wrapped in block elements
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol')) {
        return p;
      }
      // Replace single newlines with <br> within paragraphs
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  return html;
}

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const html = renderMarkdown(content);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
