import type { Citation } from '../hooks/useChatGraphStream';

function escapeMarkdown(text: string): string {
  return text.replace(/[*_`~\[\]]/g, '\\$&');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

export function formatSourcesMarkdown(citations: Citation[]): string {
  if (!citations?.length) return '';

  const seen = new Set<string>();
  const unique: Citation[] = [];
  const sorted = [...citations].sort((a, b) => a.id - b.id);

  for (const c of sorted) {
    const key = c.documentId || c.url || `${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  const lines: string[] = ['', '', '---', '', '## Quellen', ''];

  for (let i = 0; i < unique.length; i++) {
    const c = unique[i];
    const title = escapeMarkdown(c.title || 'Unbekannte Quelle');
    const num = i + 1;

    let line = `${num}. **${title}**`;
    if (c.collectionName) {
      line += ` (*${escapeMarkdown(c.collectionName)}*)`;
    }

    lines.push(line);

    const snippet = c.citedText || c.snippet;
    if (snippet) {
      lines.push(`   \u201E${escapeMarkdown(truncate(snippet, 150))}\u201C`);
    }

    if (c.url) {
      lines.push(`   \u2192 ${c.url}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
