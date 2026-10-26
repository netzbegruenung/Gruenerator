/**
 * Ein Knopf, der sich mit seinem Klick selbst abräumt („Auswahl aufheben",
 * „Löschen"), nimmt den Fokus mit. Per Tastatur gedrückt landet der Fokus
 * danach auf dem Knopf der Seite, nicht auf `<body>`. Mit der Maus bleibt
 * alles, wie es ist — ein Mausklick soll keinen Fokussprung auslösen.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasEditorLayout } from '../CanvasEditorLayout';

function Editor() {
  const [selected, setSelected] = useState(true);
  return (
    <CanvasEditorLayout
      actions={null}
      contextBar={
        selected ? (
          <button type="button" onClick={() => setSelected(false)}>
            Auswahl aufheben (Esc)
          </button>
        ) : null
      }
    >
      <div
        className="heterogeneous-multipage__page-wrapper"
        role="group"
        aria-label="Seite 1"
        aria-current="page"
      >
        <button type="button" data-page-focus-target="p1">
          Seite 1 bearbeiten
        </button>
      </div>
    </CanvasEditorLayout>
  );
}

describe('Fokus nach einem Knopf, der sich selbst abräumt', () => {
  it('geht per Tastatur auf den Knopf der Seite', async () => {
    render(<Editor />);
    const deselect = screen.getByRole('button', { name: 'Auswahl aufheben (Esc)' });
    deselect.focus();
    // Enter/Leertaste an einem Knopf lösen einen Klick mit `detail: 0` aus.
    fireEvent.click(deselect, { detail: 0 });
    expect(deselect).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Seite 1 bearbeiten' })).toHaveFocus()
    );
  });

  it('lässt den Fokus nach einem Mausklick, wo er ist', async () => {
    render(<Editor />);
    const deselect = screen.getByRole('button', { name: 'Auswahl aufheben (Esc)' });
    deselect.focus();
    fireEvent.click(deselect, { detail: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(screen.getByRole('button', { name: 'Seite 1 bearbeiten' })).not.toHaveFocus();
  });
});
