import type { ChatMessageMetadata } from '@gruenerator/chat';

export type ArtifactData = NonNullable<ChatMessageMetadata['artifactData']>;

const TYPE_LABELS: Record<ArtifactData['type'], string> = {
  html: 'HTML-Artefakt',
  svg: 'SVG-Grafik',
};

const MIME_TYPES: Record<ArtifactData['type'], string> = {
  html: 'text/html',
  svg: 'image/svg+xml',
};

const UMLAUTS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
};

/**
 * Line count as a reader would state it: a file ending in a newline has as many
 * lines as it has newlines, not one more. Empty content is zero lines rather
 * than the one empty line `split` reports.
 */
export function countLines(content: string): number {
  if (content.length === 0) return 0;
  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

/**
 * File name for the share sheet. The EXTENSION is the load-bearing part — it is
 * what decides whether the receiving app offers to render the artifact or shows
 * it as unknown bytes; the stem is only there so the file is recognisable in a
 * downloads list.
 */
export function artifactFileName(title: string, type: ArtifactData['type']): string {
  const stem = title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${stem || 'artefakt'}.${type}`;
}

export interface ArtifactCardView {
  title: string;
  typeLabel: string;
  lineLabel: string;
  fileName: string;
  mimeType: string;
}

/**
 * Preview line for a generated artifact — title, kind, size. Deliberately NOT a
 * rendering: mobile has no artifact panel, and putting HTML/SVG on screen needs
 * the WebView surface that does not exist yet. Until then the card names what
 * arrived and hands the source to an app that can open it.
 */
export function buildArtifactCardView(artifact: ArtifactData): ArtifactCardView {
  const lines = countLines(artifact.content);
  return {
    title: artifact.title,
    typeLabel: TYPE_LABELS[artifact.type],
    lineLabel: `${lines} ${lines === 1 ? 'Zeile' : 'Zeilen'}`,
    fileName: artifactFileName(artifact.title, artifact.type),
    mimeType: MIME_TYPES[artifact.type],
  };
}
