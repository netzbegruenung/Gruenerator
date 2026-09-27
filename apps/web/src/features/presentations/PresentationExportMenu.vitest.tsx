/**
 * The deck's download affordance.
 *
 * What this pins:
 *
 * The two formats are one labelled menu, not two bare icon buttons. They used
 * to sit side by side as `FiDownload` and `FiFileText` with no text, and nobody
 * recognised the second one as a download at all — the reported bug was "I only
 * get a PDF, never the pptx".
 *
 * Guests never see the PowerPoint entry. That endpoint is behind requireAuth
 * and its permission query knows only owners, ACL entries and group shares, so
 * a share-link guest can only ever get a 401. The PDF path is fully
 * client-side and must stay available to them.
 *
 * The PDF entry opens the print tab and says so. It is the one format whose
 * delivery is a browser dialog rather than a file, and a silent new tab reads
 * as a bug.
 *
 * Inside the mobile app's WebView the PDF entry is gone. There is no second
 * window there — the host disables them — so the print view would be loaded
 * over the editor in the one WebView we have, with no chrome and no way back.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { PresentationExportMenu } from './PresentationExportMenu';

const post = vi.fn();
vi.mock('../../components/utils/apiClient', () => ({
  default: { post: (...args: unknown[]): unknown => post(...args) },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]): void => void toastInfo(...args),
    loading: vi.fn(() => 'toast-id'),
    success: (...args: unknown[]): void => void toastSuccess(...args),
    error: (...args: unknown[]): void => void toastError(...args),
  },
}));

const downloadBlob = vi.fn();
vi.mock('../../utils/downloadFile', () => ({
  downloadBlob: (...args: unknown[]): void => void downloadBlob(...args),
}));

function setNativeHost() {
  (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
    postMessage: vi.fn(),
  };
}

afterEach(() => {
  delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
});

beforeEach(() => {
  vi.clearAllMocks();
  // A real window.open returns the new Window; a blocked popup returns null.
  vi.stubGlobal(
    'open',
    vi.fn(() => ({}) as Window)
  );
});

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
}

describe('PresentationExportMenu', () => {
  it('offers both formats behind one download button', async () => {
    render(<PresentationExportMenu documentId="deck-1" title="Haushalt 2027" />);
    await openMenu();
    expect(screen.getByRole('menuitem', { name: /Als PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Als PowerPoint/ })).toBeInTheDocument();
  });

  it('opens the print tab for PDF and never calls the API', async () => {
    render(<PresentationExportMenu documentId="deck-1" title="Haushalt 2027" />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /Als PDF/ }));
    expect(window.open).toHaveBeenCalledWith(
      '/office/deck-1?present=1&print-pdf',
      '_blank',
      'noopener'
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('says the print dialog is coming — a silent new tab reads as a bug', async () => {
    render(<PresentationExportMenu documentId="deck-1" title="Haushalt 2027" />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /Als PDF/ }));
    expect(toastInfo).toHaveBeenCalledWith(
      expect.stringContaining('Druckdialog'),
      expect.anything()
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it('reports a blocked popup instead of promising a dialog that never opens', async () => {
    vi.stubGlobal(
      'open',
      vi.fn(() => null)
    );
    render(<PresentationExportMenu documentId="deck-1" title="Haushalt 2027" />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /Als PDF/ }));
    expect(toastInfo).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Pop-ups'), expect.anything());
  });

  it('hides PowerPoint from guests but keeps PDF', async () => {
    render(<PresentationExportMenu documentId="deck-1" title="Haushalt 2027" isGuest />);
    await openMenu();
    expect(screen.getByRole('menuitem', { name: /Als PDF/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Als PowerPoint/ })).not.toBeInTheDocument();
  });

  it('downloads the pptx under the deck title', async () => {
    const blob = new Blob(['x']);
    post.mockResolvedValue({ data: blob });
    render(<PresentationExportMenu documentId="deck-1" title="Haushalt 2027" />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /Als PowerPoint/ }));
    expect(post).toHaveBeenCalledWith(
      '/presentations/deck-1/export/pptx',
      {},
      { responseType: 'blob' }
    );
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'Haushalt 2027.pptx');
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('falls back to a generic filename when the deck is untitled', async () => {
    post.mockResolvedValue({ data: new Blob(['x']) });
    render(<PresentationExportMenu documentId="deck-1" title="   " />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /Als PowerPoint/ }));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'Praesentation.pptx');
  });

  it('reports a 404 as missing access, not as a generic failure', async () => {
    // The controller cannot distinguish "gone" from "not yours" on purpose, so
    // the message must cover both without promising which one it was.
    post.mockRejectedValue({ response: { status: 404 } });
    render(<PresentationExportMenu documentId="deck-1" title="Haushalt 2027" />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /Als PowerPoint/ }));
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('nicht gefunden'),
      expect.anything()
    );
  });

  it('drops the PDF entry inside the app WebView and keeps PowerPoint', async () => {
    // PowerPoint stays: it goes through the download bridge, which the host
    // does answer.
    setNativeHost();
    render(<PresentationExportMenu documentId="deck-1" title="Haushalt 2027" />);
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: /Als PDF/ })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Als PowerPoint/ })).toBeInTheDocument();
  });

  it('renders nothing at all when neither format is available', async () => {
    // A guest in the WebView. Does not occur today — the handoff mints a real
    // session — but an empty menu is a worse answer than no menu.
    setNativeHost();
    render(<PresentationExportMenu documentId="deck-1" title="Haushalt 2027" isGuest />);
    expect(screen.queryByRole('button', { name: 'Herunterladen' })).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <PresentationExportMenu documentId="deck-1" title="Haushalt 2027" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
