/**
 * A created PDF must OPEN in a new tab, not drop a file in the download folder.
 *
 * The asset endpoint is authenticated (cookies on web, Bearer on desktop), so
 * the bytes still have to go through the injected config fetch — the card can't
 * just be an <a href>. What must hold: the tab is opened synchronously on the
 * click (an async window.open is popup-blocked), it is then navigated to the
 * blob, and no download is triggered.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../../stores/chatConfigStore';

import { DocumentCreatedCard } from './DocumentCreatedCard';

import type { DocumentCreatedData } from '../../types/messageMetadata';

const pdfDocument: DocumentCreatedData = {
  documentId: 'b3b6f307-90b7-465a-a5fe-d76ae8a0d69c.pdf',
  title: 'Fact Sheet – Wirtschaftswachstum Österreich 2026',
  subtype: 'pdf',
  url: '/api/chat-service/compute-assets/b3b6f307-90b7-465a-a5fe-d76ae8a0d69c.pdf',
};

const configFetch = vi.fn();
const openedTab = { location: { href: '' }, opener: {} as unknown, close: vi.fn() };
const windowOpen = vi.fn();
const createObjectURL = vi.fn(() => 'blob:mock-url');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  configFetch.mockReset().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(new Blob(['%PDF-1.7'], { type: 'application/pdf' })),
  });
  openedTab.location.href = '';
  openedTab.opener = {};
  openedTab.close.mockReset();
  windowOpen.mockReset().mockReturnValue(openedTab);
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();

  vi.stubGlobal('open', windowOpen);
  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
  useChatConfigStore.setState({ fetch: configFetch as unknown as typeof globalThis.fetch });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DocumentCreatedCard — PDF', () => {
  it('offers opening the PDF, not downloading it', () => {
    render(<DocumentCreatedCard document={pdfDocument} />);

    expect(screen.getByRole('button', { name: /PDF öffnen/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /herunterladen/i })).not.toBeInTheDocument();
  });

  it('opens the tab synchronously on the click, before the fetch resolves', async () => {
    // A window.open issued after `await` loses the user-gesture and is blocked,
    // so the handle must be claimed first and navigated later.
    let resolveFetch: (value: unknown) => void = () => {};
    configFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    render(<DocumentCreatedCard document={pdfDocument} />);

    await userEvent.click(screen.getByRole('button', { name: /PDF öffnen/i }));

    expect(windowOpen).toHaveBeenCalledWith('', '_blank');

    resolveFetch({
      ok: true,
      blob: () => Promise.resolve(new Blob(['%PDF-1.7'], { type: 'application/pdf' })),
    });
  });

  it('navigates the opened tab to the fetched blob', async () => {
    render(<DocumentCreatedCard document={pdfDocument} />);

    await userEvent.click(screen.getByRole('button', { name: /PDF öffnen/i }));

    expect(configFetch).toHaveBeenCalledWith(pdfDocument.url, { method: 'GET' });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(openedTab.location.href).toBe('blob:mock-url');
    // Severed so the PDF tab cannot reach back into the chat window.
    expect(openedTab.opener).toBeNull();
  });

  it('keeps the object URL alive so the viewer can load it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<DocumentCreatedCard document={pdfDocument} />);

    await userEvent.click(screen.getByRole('button', { name: /PDF öffnen/i }));

    // Revoking immediately would blank the freshly opened tab.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    vi.useRealTimers();
  });

  it('closes the blank tab and reports when the asset is gone (90-day expiry)', async () => {
    configFetch.mockResolvedValue({ ok: false });
    render(<DocumentCreatedCard document={pdfDocument} />);

    await userEvent.click(screen.getByRole('button', { name: /PDF öffnen/i }));

    expect(openedTab.close).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/nicht mehr verfügbar/i)).toBeInTheDocument();
  });

  it('falls back to a direct open when the popup handle is null', async () => {
    windowOpen.mockReturnValue(null);
    render(<DocumentCreatedCard document={pdfDocument} />);

    await userEvent.click(screen.getByRole('button', { name: /PDF öffnen/i }));

    expect(windowOpen).toHaveBeenLastCalledWith('blob:mock-url', '_blank', 'noopener,noreferrer');
  });
});

describe('DocumentCreatedCard — collaborative documents', () => {
  it('keeps sheets as a plain link to the editor', () => {
    render(
      <DocumentCreatedCard
        document={{
          documentId: 'abc',
          title: 'Prognosen 2026',
          subtype: 'sheets',
          url: '/office/abc',
        }}
      />
    );

    const link = screen.getByRole('link', { name: /Tabelle öffnen/i });
    expect(link).toHaveAttribute('href', '/office/abc');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
