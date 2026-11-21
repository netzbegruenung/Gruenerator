import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { PreviewDialog } from './PreviewDialog';

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Vorschau öffnen</button>
      <PreviewDialog open={open} onOpenChange={setOpen}>
        <p>Inhalt</p>
      </PreviewDialog>
    </>
  );
}

describe('PreviewDialog', () => {
  it('opens as a dialog, traps focus, switches device and closes with Escape', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Vorschau öffnen' }));

    const dialog = await screen.findByRole('dialog', { name: 'Vorschau' });
    expect(dialog).toHaveTextContent('Inhalt');

    for (let i = 0; i < 8; i++) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.click(screen.getByRole('radio', { name: 'Handy' }));
    expect(dialog.querySelector('[data-device="phone"]')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with the close button', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Vorschau öffnen' }));
    await user.click(await screen.findByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PreviewDialog focus return', () => {
  it('returns focus to the opener after Escape', async () => {
    const user = userEvent.setup();
    function Opener() {
      const [open, setOpen] = useState(false);
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={ref} onClick={() => setOpen(true)}>
            Vorschau öffnen
          </button>
          <PreviewDialog open={open} onOpenChange={setOpen} returnFocusRef={ref}>
            <p>Inhalt</p>
          </PreviewDialog>
        </>
      );
    }
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Vorschau öffnen' });
    await user.click(opener);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(opener);
  });
});
