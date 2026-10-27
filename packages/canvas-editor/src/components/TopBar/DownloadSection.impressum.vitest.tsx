import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider } from '../../CanvasEditorProvider';
import { grueneratorPrint } from '../../composer/printService';
import { axe } from '../../test-utils';

import { DownloadSection, type PrintImpressumGate } from './DownloadSection';

function renderGate(locale: PrintImpressumGate['locale']) {
  const gate: PrintImpressumGate = {
    ready: true,
    locale,
    text: null,
    onSubmit: vi.fn(),
  };
  const view = render(
    <CanvasEditorProvider services={{ print: grueneratorPrint }}>
      <DownloadSection
        onDownload={vi.fn()}
        pageCount={1}
        printExport={{ onDownloadPdf: vi.fn(), getWarnings: () => [], impressum: gate }}
      />
    </CanvasEditorProvider>
  );
  return { gate, container: view.container };
}

describe('Impressum form errors', () => {
  it('names each empty field in a linked, announced error (DE)', () => {
    const { gate } = renderGate('de-DE');
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

  it.each(['de-DE', 'de-AT'] as const)(
    'has no axe violations before and after submit (%s)',
    async (locale) => {
      const { container } = renderGate(locale);
      expect(await axe(container)).toHaveNoViolations();
      fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
      expect(await axe(container)).toHaveNoViolations();
    }
  );
});
