import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DownloadSection, type PrintImpressumGate } from './DownloadSection';

function renderGate(locale: PrintImpressumGate['locale']) {
  const gate: PrintImpressumGate = {
    ready: true,
    locale,
    text: null,
    onSubmit: vi.fn(),
  };
  render(
    <DownloadSection
      onDownload={vi.fn()}
      pageCount={1}
      printExport={{ onDownloadPdf: vi.fn(), getWarnings: () => [], impressum: gate }}
    />
  );
  return gate;
}

describe('Impressum form errors', () => {
  it('names each empty field in a linked, announced error (DE)', () => {
    const gate = renderGate('de-DE');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toEqual(['Bitte Name eintragen.', 'Bitte Anschrift eintragen.']);
    const name = screen.getByLabelText('Name');
    const errorId = name.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId as string)?.textContent).toBe('Bitte Name eintragen.');
    expect(gate.onSubmit).not.toHaveBeenCalled();
  });

  it('uses Medieninhaber for AT', () => {
    renderGate('de-AT');
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(screen.getAllByRole('alert')[0]?.textContent).toBe('Bitte Medieninhaber eintragen.');
  });
});
