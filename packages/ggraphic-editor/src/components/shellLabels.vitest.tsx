// SPDX-License-Identifier: MPL-2.0
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { layersTab } from '@ggraphic/editor/components/CanvasEditor/layersTab';
import { DownloadSection } from '@ggraphic/editor/components/TopBar/DownloadSection';
import { shareTab } from '@ggraphic/editor/configs/shareSection';
import { messages, registerMessages } from '@ggraphic/editor/i18n/messages';

import { AddPageButton } from './AddPageButton.js';
import { CanvasMetaBar } from './CanvasMetaBar.js';

afterEach(() => registerMessages('de'));

function metaBar() {
  return render(
    <CanvasMetaBar pageCount={3} currentPageIndex={1} zoom={1} onZoomChange={vi.fn()} />
  );
}

describe('shell labels follow the catalogue', () => {
  it('keeps the German texts byte for byte', () => {
    metaBar();
    expect(screen.getByRole('button', { name: 'Verkleinern' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vergrößern' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vollbild' })).toBeTruthy();
    expect(screen.getByLabelText('Seite 2 von 3')).toBeTruthy();
    expect(layersTab.label).toBe('Ebenen');
    expect(layersTab.ariaLabel).toBe('Ebenen: alle Elemente der Seite');
    expect(shareTab.label).toBe('Teilen');
    expect(shareTab.ariaLabel).toBe('Teilen: Bild weitergeben');
  });

  it('keeps the German add-page and download texts', () => {
    render(<AddPageButton onAddPage={vi.fn()} renderPicker={null} />);
    expect(screen.getByRole('button', { name: 'Seite hinzufügen' })).toBeTruthy();
    expect(screen.getByRole('button').getAttribute('title')).toBe('Neue Seite hinzufügen');
    render(<DownloadSection onDownload={vi.fn()} pageCount={1} />);
    expect(screen.getByText('Format')).toBeTruthy();
    expect(screen.getByText('Auflösung')).toBeTruthy();
    expect(screen.getByText('Transparenter Hintergrund')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Herunterladen' })).toBeTruthy();
  });

  it('renders the zoom and page controls in English', () => {
    registerMessages('en');
    metaBar();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeTruthy();
    expect(screen.getByLabelText('Page 2 of 3')).toBeTruthy();
  });

  it('renders add page and download in English', () => {
    registerMessages('en');
    render(<AddPageButton onAddPage={vi.fn()} renderPicker={null} />);
    expect(screen.getByRole('button', { name: 'Add page' })).toBeTruthy();
    render(<DownloadSection onDownload={vi.fn()} pageCount={1} />);
    expect(screen.getByText('Resolution')).toBeTruthy();
    expect(screen.getByText('Transparent background')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  });

  it('reads the tab labels lazily', () => {
    registerMessages('en');
    expect(layersTab.label).toBe(messages().sidebar.layers.title);
    expect(layersTab.ariaLabel).toBe(messages().sidebar.layers.tabAriaLabel);
    expect(shareTab.label).toBe(messages().shell.share);
    expect(shareTab.label).not.toBe('Teilen');
  });
});
