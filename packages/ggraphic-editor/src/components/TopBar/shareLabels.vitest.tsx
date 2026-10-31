// SPDX-License-Identifier: MPL-2.0
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browserFileDelivery } from '../../hostServices.js';
import { CanvasEditorProvider } from '../../CanvasEditorProvider.js';
import { registerMessages } from '../../i18n/messages.js';
import { GenericShareSection } from '../../sidebar/sections/GenericShareSection.js';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider.js';
import { DownloadSection } from './DownloadSection.js';

let mobile = false;
beforeEach(() => {
  mobile = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => registerMessages('de'));

function share() {
  return render(
    <CanvasEditorProvider
      services={{ fileDelivery: { ...browserFileDelivery, pickShareRoute: () => 'web-share' } }}
    >
      <AutoSaveStoreProvider>
        <GenericShareSection
          exportedImage="blob:test-export"
          shareToken={null}
          onCaptureCanvas={() => {}}
          onDownload={() => {}}
          onNavigateToGallery={() => {}}
          canvasText="x"
          canvasType="freeform"
          onSaveAsTemplate={() => {}}
        />
      </AutoSaveStoreProvider>
    </CanvasEditorProvider>
  );
}

describe('share and download labels', () => {
  it('speaks German by default, byte for byte', () => {
    share();
    expect(screen.getByText('Download & Teilen')).toBeTruthy();
    expect(screen.getByTitle('Herunterladen')).toBeTruthy();
    expect(screen.getByLabelText('Bild herunterladen')).toBeTruthy();
    expect(screen.getByTitle('Teilen')).toBeTruthy();
    expect(screen.getByLabelText('Bild teilen')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vorlage' })).toBeTruthy();
    expect(screen.getByText(/Als Vorlage speichern/)).toBeTruthy();
  });

  it('names the mobile tabs from the catalogue', () => {
    mobile = true;
    share();
    expect(screen.getByRole('tab', { name: 'Download' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Vorlage' })).toBeTruthy();
  });

  it('names the mobile tabs in English', () => {
    mobile = true;
    registerMessages('en');
    share();
    expect(screen.getByRole('tab', { name: 'Download' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Template' })).toBeTruthy();
  });

  it('speaks English under en', () => {
    registerMessages('en');
    share();
    expect(screen.getByText('Download & share')).toBeTruthy();
    expect(screen.getByTitle('Download')).toBeTruthy();
    expect(screen.getByLabelText('Download image')).toBeTruthy();
    expect(screen.getByTitle('Share')).toBeTruthy();
    expect(screen.getByLabelText('Share image')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Template' })).toBeTruthy();
    expect(screen.queryByText(/Vorlage/)).toBeNull();
  });

  it('DownloadSection page and resolution labels follow the locale', () => {
    const { unmount } = render(
      <DownloadSection onDownload={vi.fn()} onDownloadAllZip={vi.fn()} pageCount={2} />
    );
    expect(screen.getByText('Seiten auswählen')).toBeTruthy();
    expect(screen.getByText('Aktuelle Seite')).toBeTruthy();
    expect(screen.getByText(/\(Standard\)/)).toBeTruthy();
    unmount();
    registerMessages('en');
    render(<DownloadSection onDownload={vi.fn()} onDownloadAllZip={vi.fn()} pageCount={2} />);
    expect(screen.getByText('Select pages')).toBeTruthy();
    expect(screen.getByText('Current page')).toBeTruthy();
    expect(screen.getByText(/\(default\)/)).toBeTruthy();
  });
});
