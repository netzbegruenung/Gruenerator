// Ein modaler Radix-Dialog setzt `pointer-events: none` an den <body>. Ohne
// Gegenwehr erbt der Toaster das, und „Rückgängig" im Toast ist tot, solange ein
// Dialog offen ist. Wird der Toast klickbar, wertet Radix den Klick als
// außerhalb und schließt den Dialog. Beides hält dieser Test fest.
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetTitle,
  Toaster,
  toast,
} from '@gruenerator/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// sonners Wisch-Logik fängt den Zeiger ein; jsdom kennt Pointer Capture nicht.
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  toast.dismiss();
});

const surfaces = {
  Dialog: (onOpenChange: (open: boolean) => void) => (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Offen</DialogTitle>
      </DialogContent>
    </Dialog>
  ),
  Sheet: (onOpenChange: (open: boolean) => void) => (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>Offen</SheetTitle>
      </SheetContent>
    </Sheet>
  ),
};

describe.each(Object.entries(surfaces))('Toast über einem offenen %s', (_, renderSurface) => {
  it('die Aktion lässt sich klicken, und der Dialog bleibt offen', async () => {
    const onOpenChange = vi.fn();
    const onUndo = vi.fn();
    render(
      <>
        <Toaster />
        {renderSurface(onOpenChange)}
      </>
    );
    expect(document.body.style.pointerEvents).toBe('none');

    toast('Gelöscht', { action: { label: 'Rückgängig', onClick: onUndo } });
    await userEvent.click(await screen.findByRole('button', { name: 'Rückgängig' }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
