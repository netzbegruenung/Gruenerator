/**
 * Display metadata for file/document attachments, carried as a synthetic data
 * content part (same mechanism as the pasted-text preview and reel-upload
 * parts). The model adapter ignores data parts, so this never reaches the
 * wire — it exists purely so the attachment chips can show "1,2 MB · 14 Seiten"
 * both in the live session and after a thread reload.
 */
export const ATTACHMENT_META_PART_NAME = 'gruenerator-attachment-meta';

export interface AttachmentMetaData {
  /** Real file size in bytes (live: `File.size`; reload: `size_bytes` row). */
  size?: number;
  /** PDF page count (live: client-side probe; reload: OCR result). */
  pageCount?: number;
  /** Reload only: first chars of the extracted text, for the preview dialog. */
  preview?: string;
  /** Reload only: whether `preview` was cut off at the persistence cap. */
  truncated?: boolean;
}

export function isAttachmentMetaData(data: unknown): data is AttachmentMetaData {
  return data !== null && typeof data === 'object';
}

/** 412 KB / 1,2 MB — matches the chips' compact meta line, de-DE formatted. */
export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

export function formatPageCount(pages: number): string {
  return pages === 1 ? '1 Seite' : `${pages} Seiten`;
}

/**
 * Best-effort client-side PDF page count, without a PDF library (pdf-lib was
 * deliberately kept out of the frontend bundle). Counts uncompressed
 * `/Type /Page` objects; falls back to the page tree's `/Count`. PDFs that
 * store their page tree in compressed object streams return null — the chip
 * then simply omits the page line (the OCR-derived count still appears after
 * a reload).
 */
export async function getPdfPageCount(file: File): Promise<number | null> {
  if (file.type !== 'application/pdf') return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // latin1 keeps a 1:1 byte→char mapping, so regex offsets stay byte-true.
    const text = new TextDecoder('latin1').decode(bytes);

    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
    if (pageMatches && pageMatches.length > 0) return pageMatches.length;

    let maxCount = 0;
    for (const match of text.matchAll(/\/Count\s+(\d+)/g)) {
      const count = Number(match[1]);
      if (count > maxCount) maxCount = count;
    }
    return maxCount > 0 ? maxCount : null;
  } catch {
    return null;
  }
}
