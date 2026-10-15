import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { composePrintImpressum, PRINT_IMPRESSUM_ID } from '../../../composer/composePrint';
import { impressumLine, type ImpressumLocale } from '../../../composer/printImpressum';
import { DownloadSection } from '../DownloadSection';

/** Stands in for the editor: the gate text lives in "canvas state" and the form writes to it. */
function Harness({
  locale,
  initial,
  onDownloadPdf,
  withGate = true,
}: {
  locale: ImpressumLocale;
  initial: string | null;
  onDownloadPdf: () => Promise<void>;
  withGate?: boolean;
}) {
  const [text, setText] = useState<string | null>(initial);
  return (
    <DownloadSection
      onDownload={vi.fn()}
      pageCount={1}
      printExport={{
        onDownloadPdf,
        getWarnings: () => [],
        impressum: withGate
          ? {
              ready: true,
              locale,
              text,
              onSubmit: (parts) => setText(impressumLine(locale, parts)),
            }
          : null,
      }}
    />
  );
}

const download = () => screen.getByRole('button', { name: /Herunterladen/ });

describe('print impressum gate', () => {
  it.each([
    ['empty line', 'V.i.S.d.P.: '],
    ['placeholder', 'V.i.S.d.P.: Vorname Nachname, Straße Nr., PLZ Ort'],
    ['missing element', null],
  ])('blocks the DE PDF on %s and shows the form', async (_, initial) => {
    const onDownloadPdf = vi.fn().mockResolvedValue(undefined);
    render(<Harness locale="de-DE" initial={initial} onDownloadPdf={onDownloadPdf} />);
    expect(screen.getByText('Impressum ergänzen')).toBeTruthy();
    expect(
      screen.getByText('Für Plakate ist V.i.S.d.P. mit Name und Anschrift Pflicht.')
    ).toBeTruthy();
    expect((download() as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(download());
    expect(onDownloadPdf).not.toHaveBeenCalled();
  });

  it('blocks the AT placeholder with the Medieninhaber hint', () => {
    render(
      <Harness
        locale="de-AT"
        initial="Impressum: Name/Organisation, Straße Nr., PLZ Ort"
        onDownloadPdf={vi.fn()}
      />
    );
    expect(
      screen.getByText('Für Plakate ist ein Impressum mit Medieninhaber und Anschrift Pflicht.')
    ).toBeTruthy();
    expect(screen.getByLabelText('Medieninhaber')).toBeTruthy();
  });

  it('keeps the form until both fields are filled, then releases the PDF', async () => {
    const onDownloadPdf = vi.fn().mockResolvedValue(undefined);
    render(<Harness locale="de-DE" initial={null} onDownloadPdf={onDownloadPdf} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Erika Muster');
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(screen.getByText('Impressum ergänzen')).toBeTruthy();

    await userEvent.type(screen.getByLabelText('Anschrift'), 'Hauptstr. 1, 10115 Berlin');
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() => expect(screen.queryByText('Impressum ergänzen')).toBeNull());
    expect((download() as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(download());
    await waitFor(() => expect(onDownloadPdf).toHaveBeenCalledTimes(1));
  });

  it('never blocks without a gate (business card, digital)', async () => {
    const onDownloadPdf = vi.fn().mockResolvedValue(undefined);
    render(
      <Harness locale="de-DE" initial={null} onDownloadPdf={onDownloadPdf} withGate={false} />
    );
    expect(screen.queryByText('Impressum ergänzen')).toBeNull();
    await userEvent.click(download());
    await waitFor(() => expect(onDownloadPdf).toHaveBeenCalledTimes(1));

    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(<DownloadSection onDownload={onDownload} pageCount={1} />);
    expect(screen.queryAllByText('Impressum ergänzen')).toHaveLength(0);
  });
});

describe('composePrintImpressum', () => {
  it('re-adds the line at the poster standard position', () => {
    const el = composePrintImpressum('print-a3-hoch', false, 'V.i.S.d.P.: A, B');
    expect(el.id).toBe(PRINT_IMPRESSUM_ID);
    expect(el.rotation).toBe(-90);
    expect(el.text).toBe('V.i.S.d.P.: A, B');
  });
});
