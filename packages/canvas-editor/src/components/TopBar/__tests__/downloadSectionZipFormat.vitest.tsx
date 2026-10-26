import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DownloadSection } from '../DownloadSection';

// Radix Select asks for pointer capture and scrolls the active item into view;
// jsdom has neither.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe('DownloadSection ZIP format', () => {
  it('exports all pages in the chosen format', async () => {
    const user = userEvent.setup();
    const onDownloadAllZip = vi.fn().mockResolvedValue(undefined);
    render(
      <DownloadSection onDownload={vi.fn()} onDownloadAllZip={onDownloadAllZip} pageCount={3} />
    );

    await user.click(screen.getByRole('combobox', { name: 'Format' }));
    await user.click(await screen.findByRole('option', { name: 'JPG' }));
    await user.click(screen.getByRole('combobox', { name: 'Seiten auswählen' }));
    await user.click(await screen.findByRole('option', { name: /Alle 3 Seiten/ }));
    await user.click(screen.getByRole('button', { name: /Herunterladen/ }));

    expect(onDownloadAllZip).toHaveBeenCalledWith('jpeg');
  });
});
