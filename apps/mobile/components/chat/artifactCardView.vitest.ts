import { describe, expect, it } from 'vitest';

import { artifactFileName, buildArtifactCardView, countLines } from './artifactCardView';

import type { ArtifactData } from './artifactCardView';

function artifact(overrides: Partial<ArtifactData> = {}): ArtifactData {
  return {
    id: 'artifact-1',
    type: 'html',
    title: 'Zeitplan Wahlkampf',
    content: '<p>hallo</p>',
    ...overrides,
  };
}

describe('countLines', () => {
  it('counts a single line without a trailing newline', () => {
    expect(countLines('<p>hallo</p>')).toBe(1);
  });

  it('does not count the empty remainder after a trailing newline', () => {
    expect(countLines('a\nb\n')).toBe(2);
  });

  it('counts blank lines in the middle', () => {
    expect(countLines('a\n\nb')).toBe(3);
  });

  it('reports empty content as zero lines, not one', () => {
    expect(countLines('')).toBe(0);
  });
});

describe('artifactFileName', () => {
  it('keeps the extension matching the artifact type', () => {
    expect(artifactFileName('Diagramm', 'svg')).toBe('diagramm.svg');
  });

  it('transliterates umlauts rather than dropping them', () => {
    expect(artifactFileName('Grüne Zukunft', 'html')).toBe('gruene-zukunft.html');
  });

  it('collapses punctuation and trims the separators it leaves behind', () => {
    expect(artifactFileName('Plan: A & B!', 'html')).toBe('plan-a-b.html');
  });

  it('falls back to a stem when the title reduces to nothing', () => {
    expect(artifactFileName('★ ★', 'svg')).toBe('artefakt.svg');
  });
});

describe('buildArtifactCardView', () => {
  it('names the kind and the size of an HTML artifact', () => {
    const view = buildArtifactCardView(artifact({ content: 'a\nb\nc' }));
    expect(view.typeLabel).toBe('HTML-Artefakt');
    expect(view.lineLabel).toBe('3 Zeilen');
    expect(view.mimeType).toBe('text/html');
  });

  it('uses the singular for a one-line artifact', () => {
    expect(buildArtifactCardView(artifact()).lineLabel).toBe('1 Zeile');
  });

  it('carries the SVG mime type so the share target can render it', () => {
    const view = buildArtifactCardView(artifact({ type: 'svg', title: 'Logo' }));
    expect(view.typeLabel).toBe('SVG-Grafik');
    expect(view.mimeType).toBe('image/svg+xml');
    expect(view.fileName).toBe('logo.svg');
  });
});
