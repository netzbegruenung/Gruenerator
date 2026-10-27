/**
 * The browser session gets its own branch in the panel: it is a live read-out,
 * not an HTML artifact — no download (there is nothing to download), no
 * "describe changes in chat" hint (the chat cannot edit a finished run), and
 * no blank sandboxed iframe. The HTML branch must stay exactly as it was.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useArtifactLiveStore } from '../stores/artifactLiveStore';

import { ArtifactPanel } from './ArtifactPanel';

afterEach(() => {
  useArtifactLiveStore.getState().setActiveArtifact(null);
});

describe('ArtifactPanel', () => {
  it('renders a browser session as the live view, badged „Browser"', () => {
    useArtifactLiveStore.getState().setActiveArtifact({
      id: 'bs-1',
      type: 'browser_session',
      title: 'gruene.de erkunden',
      startUrl: 'https://gruene.de',
      status: 'running',
      steps: [],
      screenshots: [],
      summary: null,
    });
    const { container } = render(<ArtifactPanel />);

    expect(screen.getByText('Browser')).toBeInTheDocument();
    expect(screen.getByText('Browser startet …')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Artefakt herunterladen' })).toBeNull();
    expect(screen.queryByText(/Beschreibe Änderungen/)).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('still renders an HTML artifact in the sandboxed iframe with download and hint', () => {
    useArtifactLiveStore.getState().setActiveArtifact({
      id: 'a-1',
      type: 'html',
      title: 'Seite',
      content: '<p>Hallo</p>',
    });
    const { container } = render(<ArtifactPanel />);

    expect(screen.getByText('HTML')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Artefakt herunterladen' })).toBeInTheDocument();
    expect(screen.getByText(/Beschreibe Änderungen/)).toBeInTheDocument();
    expect(container.querySelector('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  });
});
