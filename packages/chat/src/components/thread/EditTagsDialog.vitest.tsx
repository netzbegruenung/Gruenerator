// Die drei Thread-Dialoge bauen ihr Radix-Content selbst und bekommen den
// Toast-Riegel aus `DialogContent` deshalb nicht geschenkt. Ohne ihn schließt
// ein Klick auf „Rückgängig" im Toast den offenen Dialog.
import { Toaster, toast } from '@gruenerator/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { EditTagsDialog } from './EditTagsDialog';

// sonners Wisch-Logik fängt den Zeiger ein; jsdom kennt Pointer Capture nicht.
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  toast.dismiss();
});

describe('EditTagsDialog unter einem Toast', () => {
  it('die Toast-Aktion schließt den Dialog nicht', async () => {
    const onOpenChange = vi.fn();
    const onUndo = vi.fn();
    render(
      <>
        <Toaster />
        <EditTagsDialog threadId="t1" initialTags={[]} open onOpenChange={onOpenChange} />
      </>
    );

    toast('Gelöscht', { action: { label: 'Rückgängig', onClick: onUndo } });
    await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
