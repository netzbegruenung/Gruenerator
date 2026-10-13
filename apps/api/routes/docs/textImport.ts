import { markdownToHtml } from '../../services/markdown/index.js';

export type TextImportKind = 'markdown' | 'plain';

const TEXT_KIND_BY_EXTENSION: Record<string, TextImportKind> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'plain',
};

/**
 * Browsers send `.md` as `text/markdown`, `text/x-markdown`, `application/octet-stream`
 * or nothing at all, so the extension decides — not the MIME type.
 */
export function textImportKind(filename: string): TextImportKind | null {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return null;
  return TEXT_KIND_BY_EXTENSION[filename.slice(dot).toLowerCase()] ?? null;
}

const BOM = 0xfeff;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function textBufferToHtml(buffer: Buffer, kind: TextImportKind): string {
  const decoded = buffer.toString('utf8');
  const text = (decoded.charCodeAt(0) === BOM ? decoded.slice(1) : decoded)
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!text) return '';

  if (kind === 'markdown') return markdownToHtml(text);

  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
