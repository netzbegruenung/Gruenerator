import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ConfirmAlert } from './DeleteSiteDialog';

function Host() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref}>Weitere Aktionen</button>
      <button onClick={() => setOpen(true)}>Öffnen</button>
      <ConfirmAlert
        open={open}
        onOpenChange={setOpen}
        title="Löschen?"
        description="Beschreibung"
        confirmLabel="Löschen"
        onConfirm={() => {}}
        returnFocusRef={ref}
      />
    </>
  );
}

describe('ConfirmAlert focus return', () => {
  it('focuses the given element after Cancel', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Öffnen' }));
    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Weitere Aktionen' }));
  });

  it('focuses the given element after Escape', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Öffnen' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Weitere Aktionen' }));
  });
});
