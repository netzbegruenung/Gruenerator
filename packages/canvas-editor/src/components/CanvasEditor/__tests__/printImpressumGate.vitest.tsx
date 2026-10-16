import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { getCanvasFormat, isPrintFormat, type PrintCanvasFormat } from '../../../formats';
import { DownloadSection } from '../../TopBar/DownloadSection';
import {
  usePrintImpressumGate,
  type ObservedPages,
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
const page2 = { id: 'p2', configId: 'freeform' };
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

const byId = (...reports: ObservedPageState[]): ObservedPages =>
  Object.fromEntries(reports.map((r) => [r.pageId, r]));

/** The gate as CanvasEditor wires it into the share popover. */
function Gated({
  observedState,
  pages = [page1],
  format = poster,
  onDownloadPdf = vi.fn(),
}: {
  observedState: ObservedPages;
  pages?: { id: string; configId: string }[];
  format?: PrintCanvasFormat | null;
  onDownloadPdf?: () => Promise<void>;
}) {
  const gate = usePrintImpressumGate(format, pages, observedState);
  return (
    <DownloadSection
      onDownload={vi.fn()}
      pageCount={2}
      printExport={{ onDownloadPdf, getWarnings: () => [], impressum: gate }}
    />
  );
}
const downloadDisabled = () =>
  (screen.getByRole('button', { name: /Herunterladen/ }) as HTMLButtonElement).disabled;
const warning = () => screen.queryByText(/kein vollständiges Impressum/);

describe('usePrintImpressumGate', () => {
  it('warns about a placeholder on page 1 (the active page is irrelevant)', () => {
    render(<Gated observedState={byId(observed(PLACEHOLDER))} />);
    expect(warning()).toBeTruthy();
    expect(screen.getByText('Impressum ergänzen')).toBeTruthy();
    expect(downloadDisabled()).toBe(false);
  });

  it('still downloads the PDF without an impressum', async () => {
    const onDownloadPdf = vi.fn(async () => {});
    render(<Gated observedState={byId(observed(null))} onDownloadPdf={onDownloadPdf} />);
    await userEvent.click(screen.getByRole('button', { name: /Herunterladen/ }));
    expect(onDownloadPdf).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on a filled impressum on page 1', () => {
    render(<Gated observedState={byId(observed(FILLED))} />);
    expect(warning()).toBeNull();
    expect(screen.queryByText('Impressum ergänzen')).toBeNull();
    expect(downloadDisabled()).toBe(false);
  });

  it('does not warn or block while a page has not reported, or only a removed page reported', () => {
    const { unmount } = render(<Gated observedState={{}} />);
    expect(warning()).toBeNull();
    expect(downloadDisabled()).toBe(false);
    unmount();
    render(<Gated observedState={byId(observed(FILLED, {}, 'other'))} />);
    expect(warning()).toBeNull();
    expect(downloadDisabled()).toBe(false);
  });

  it('never gates business cards or digital canvases', () => {
    expect(renderHook(() => usePrintImpressumGate(card, [page1], {})).result.current).toBeNull();
    expect(renderHook(() => usePrintImpressumGate(null, [page1], {})).result.current).toBeNull();
  });

  it('updates the existing element on page 1', async () => {
    const updateAdditionalText = vi.fn();
    render(<Gated observedState={byId(observed(PLACEHOLDER, { updateAdditionalText }))} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Erika Muster');
    await userEvent.type(screen.getByLabelText('Anschrift'), 'Hauptstr. 1, 10115 Berlin');
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(updateAdditionalText).toHaveBeenCalledWith('impressum', {
      text: 'V.i.S.d.P.: Erika Muster, Hauptstr. 1, 10115 Berlin',
    });
  });

  it('re-adds a deleted element on page 1', async () => {
    const addAdditionalTextElement = vi.fn();
    render(<Gated observedState={byId(observed(null, { addAdditionalTextElement }))} />);
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

  it('warns about a poster whose added page has no impressum', () => {
    render(
      <Gated
        pages={[page1, page2]}
        observedState={byId(observed(FILLED), observed(null, {}, 'p2'))}
      />
    );
    expect(warning()).toBeTruthy();
    expect(screen.getByText('Impressum ergänzen')).toBeTruthy();
    expect(downloadDisabled()).toBe(false);
  });

  it('writes the line to every page of the poster', async () => {
    const update1 = vi.fn();
    const add2 = vi.fn();
    render(
      <Gated
        pages={[page1, page2]}
        observedState={byId(
          observed(FILLED, { updateAdditionalText: update1 }),
          observed(null, { addAdditionalTextElement: add2 }, 'p2')
        )}
      />
    );
    await userEvent.type(screen.getByLabelText('Name'), 'Erika Muster');
    await userEvent.type(screen.getByLabelText('Anschrift'), 'Hauptstr. 1, 10115 Berlin');
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(update1).toHaveBeenCalledWith('impressum', { text: FILLED });
    expect(add2.mock.calls[0][0]).toMatchObject({ id: 'impressum', text: FILLED });
  });
});
