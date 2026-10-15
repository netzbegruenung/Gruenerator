import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { getCanvasFormat, isPrintFormat, type PrintCanvasFormat } from '../../../formats';
import { DownloadSection } from '../../TopBar/DownloadSection';
import {
  isPosterImpressumComplete,
  usePrintImpressumGate,
  type ObservedPageState,
} from '../hooks/usePrintImpressumGate';

const printFormat = (id: string): PrintCanvasFormat => {
  const f = getCanvasFormat(id);
  if (!f || !isPrintFormat(f)) throw new Error(id);
  return f;
};
const poster = printFormat('print-a3-hoch');
const card = printFormat('print-visitenkarte-quer');

const page1 = { id: 'p1', configId: 'freeform' };
const PLACEHOLDER = 'V.i.S.d.P.: Vorname Nachname, Straße Nr., PLZ Ort';
const FILLED = 'V.i.S.d.P.: Erika Muster, Hauptstr. 1, 10115 Berlin';

const observed = (
  text: string | null,
  actions: Record<string, unknown> = {},
  pageId = 'p1'
): ObservedPageState => ({
  pageId,
  actions,
  state: { additionalTexts: text === null ? [] : [{ id: 'impressum', text }] },
});

/** The gate as CanvasEditor wires it into the share popover. */
function Gated({
  observedState,
  format = poster,
}: {
  observedState: ObservedPageState | null;
  format?: PrintCanvasFormat | null;
}) {
  const gate = usePrintImpressumGate(format, page1, observedState);
  return (
    <DownloadSection
      onDownload={vi.fn()}
      pageCount={2}
      printExport={{ onDownloadPdf: vi.fn(), getWarnings: () => [], impressum: gate }}
    />
  );
}
const downloadDisabled = () =>
  (screen.getByRole('button', { name: /Herunterladen/ }) as HTMLButtonElement).disabled;

describe('usePrintImpressumGate', () => {
  it('blocks a placeholder on page 1 (the active page is irrelevant)', () => {
    render(<Gated observedState={observed(PLACEHOLDER)} />);
    expect(downloadDisabled()).toBe(true);
    expect(screen.getByText('Impressum ergänzen')).toBeTruthy();
  });

  it('allows a filled impressum on page 1', () => {
    render(<Gated observedState={observed(FILLED)} />);
    expect(downloadDisabled()).toBe(false);
  });

  it('fails closed while page 1 has not reported, or a stale page reported', () => {
    const { unmount } = render(<Gated observedState={null} />);
    expect(downloadDisabled()).toBe(true);
    expect(screen.getByText('Impressum wird geprüft …')).toBeTruthy();
    unmount();
    render(<Gated observedState={observed(FILLED, {}, 'other')} />);
    expect(downloadDisabled()).toBe(true);
  });

  it('never gates business cards or digital canvases', () => {
    expect(renderHook(() => usePrintImpressumGate(card, page1, null)).result.current).toBeNull();
    expect(renderHook(() => usePrintImpressumGate(null, page1, null)).result.current).toBeNull();
  });

  it('updates the existing element on page 1', async () => {
    const updateAdditionalText = vi.fn();
    render(<Gated observedState={observed(PLACEHOLDER, { updateAdditionalText })} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Erika Muster');
    await userEvent.type(screen.getByLabelText('Anschrift'), 'Hauptstr. 1, 10115 Berlin');
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(updateAdditionalText).toHaveBeenCalledWith('impressum', {
      text: 'V.i.S.d.P.: Erika Muster, Hauptstr. 1, 10115 Berlin',
    });
  });

  it('re-adds a deleted element on page 1', async () => {
    const addAdditionalTextElement = vi.fn();
    render(<Gated observedState={observed(null, { addAdditionalTextElement })} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Erika Muster');
    await userEvent.type(screen.getByLabelText('Anschrift'), 'Hauptstr. 1, 10115 Berlin');
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(addAdditionalTextElement).toHaveBeenCalledTimes(1);
    expect(addAdditionalTextElement.mock.calls[0][0]).toMatchObject({
      id: 'impressum',
      rotation: -90,
      text: 'V.i.S.d.P.: Erika Muster, Hauptstr. 1, 10115 Berlin',
    });
  });
});

describe('isPosterImpressumComplete (export re-check)', () => {
  it('is false when unknown, stale, missing or placeholder; true when filled', () => {
    expect(isPosterImpressumComplete(page1, null)).toBe(false);
    expect(isPosterImpressumComplete(null, observed(FILLED))).toBe(false);
    expect(isPosterImpressumComplete(page1, observed(FILLED, {}, 'other'))).toBe(false);
    expect(isPosterImpressumComplete(page1, observed(null))).toBe(false);
    expect(isPosterImpressumComplete(page1, observed(PLACEHOLDER))).toBe(false);
    expect(isPosterImpressumComplete(page1, observed(FILLED))).toBe(true);
  });
});
