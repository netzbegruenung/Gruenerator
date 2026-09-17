/**
 * Die Formatierungsknöpfe in der Kontextleiste der Kopfleiste.
 *
 * Der Editor entsteht tief in der Leinwand, die Leiste steht weit darüber.
 * Diese Tests halten die Naht fest, über die er sie erreicht: den Provider an
 * der Wurzel und `useCanvasTextFormatting` — dessen Aufruf zugleich die
 * Anmeldung als Wirt ist. Ohne sie fielen die Knöpfe stumm aus — sichtbar,
 * aber ohne Editor dahinter.
 */
import { render, screen, act } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasTextEditorProvider, useCanvasTextEditor } from '../../CanvasTextOverlay';
import { ContextControls } from '../ContextControls';

import type { TextEditSession } from '../../CanvasTextOverlay';
import type { FloatingModuleState } from '../../../hooks/useFloatingModuleState';

const PT_SANS = 'PT Sans, Arial, sans-serif';
const GRUENE_TYPE = 'GrueneTypeNeue, Arial, sans-serif';

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

function textModule(id: string): FloatingModuleState {
  return { type: 'text', data: { id, fontSize: 24, fill: '#005538' } };
}

/**
 * Meldet eine Sitzung an, wie es ein Knoten beim Doppelklick tut — ohne
 * Konva, denn hier geht es um den Weg vom Editor zur Leiste, nicht um die
 * Geometrie (die prüft `canvasTextEditing`).
 */
function OpenSession({ id, fontFamily }: { id: string; fontFamily: string }) {
  const { open } = useCanvasTextEditor(id);
  useEffect(() => {
    const session: TextEditSession = {
      id,
      box: { top: 0, left: 0, width: 400, minHeight: 80, scale: 1 },
      text: 'Klimaschutz ist kein Sprint',
      fontFamily,
      fontSize: 24,
      fontStyle: 'normal',
      fill: '#005538',
      align: 'left',
      opacity: 1,
      lineHeight: 1.2,
      onTextChange: () => {},
    };
    open(session);
  }, [open, id, fontFamily]);
  return null;
}

function renderBar({
  selectedId = 'text-1',
  editedId,
  fontFamily = PT_SANS,
}: {
  selectedId?: string;
  editedId?: string;
  fontFamily?: string;
} = {}) {
  return render(
    <CanvasTextEditorProvider>
      {editedId && <OpenSession id={editedId} fontFamily={fontFamily} />}
      <ContextControls
        selectedElement={selectedId}
        activeFloatingModule={textModule(selectedId)}
        canMoveUp
        canMoveDown
        canDuplicate
        handlers={HANDLERS}
      />
    </CanvasTextEditorProvider>
  );
}

/** Auswahl über den ganzen Text — siehe `RichTextField.vitest.tsx`. */
function selectAllInEditor() {
  const content = document.querySelector<HTMLElement>('.canvas-rte__content');
  if (!content) throw new Error('kein contenteditable gerendert');
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  return content;
}

describe('Kontextleiste: Textformatierung', () => {
  it('zeigt ohne offenen Editor keine Schnitt-Knöpfe', () => {
    renderBar();

    // Ein bloß ausgewähltes Feld hat keine Auswahl IM Text, auf die ein
    // Mark wirken könnte — Farbe und Schriftgröße bleiben natürlich da.
    expect(screen.queryByRole('toolbar', { name: 'Textformatierung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fett/ })).not.toBeInTheDocument();
  });

  it('nimmt sie auf, sobald ein Feld bearbeitet wird', () => {
    renderBar({ editedId: 'text-1' });

    expect(screen.getByRole('toolbar', { name: 'Textformatierung' })).toBeInTheDocument();
    for (const label of [/Fett/, /Kursiv/, /Unterstrichen/, /^Aufzählung$/, /Nummerierte/]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('zeigt die schwebende Karte dann NICHT — eine Leiste je Handlung', () => {
    renderBar({ editedId: 'text-1' });

    expect(document.querySelector('.canvas-rte__floating-toolbar')).toBeNull();
    expect(screen.getAllByRole('toolbar', { name: 'Textformatierung' })).toHaveLength(1);
  });

  it('ein Klick in der Leiste zeichnet die Auswahl im Editor aus', () => {
    renderBar({ editedId: 'text-1' });

    const content = selectAllInEditor();
    act(() => {
      screen.getByRole('button', { name: /Fett/ }).click();
    });

    expect(content.querySelector('strong')).toHaveTextContent('Klimaschutz ist kein Sprint');
  });

  it('richtet sich nach der Schrift des bearbeiteten Feldes', () => {
    renderBar({ editedId: 'text-1', fontFamily: GRUENE_TYPE });

    expect(screen.queryByRole('button', { name: /Fett/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kursiv/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unterstrichen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Aufzählung$/ })).toBeInTheDocument();
  });

  it('zeigt sie nicht, wenn die Auswahl auf einem anderen Element steht', () => {
    // Auswahl und Sitzung laufen im Betrieb nicht auseinander; liefe es doch
    // je so, bedienten die Knöpfe sichtbar das falsche Element.
    renderBar({ selectedId: 'text-2', editedId: 'text-1' });

    expect(screen.queryByRole('toolbar', { name: 'Textformatierung' })).not.toBeInTheDocument();
  });

  it('räumt die Knöpfe ab, wenn der Editor schließt', () => {
    const { unmount } = renderBar({ editedId: 'text-1' });
    expect(screen.getByRole('toolbar', { name: 'Textformatierung' })).toBeInTheDocument();

    unmount();
    expect(screen.queryByRole('toolbar', { name: 'Textformatierung' })).not.toBeInTheDocument();
  });
});

describe('useCanvasTextFormatting: Wirt ohne Provider', () => {
  it('lässt eine Leiste ohne Editor-Schicht unbehelligt', () => {
    // Die Vorschaubilder rendern Leisten-Teile ohne Editor — das darf nicht
    // werfen, sondern muss schlicht nichts zeigen.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ContextControls
        selectedElement="text-1"
        activeFloatingModule={textModule('text-1')}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate={false}
        handlers={HANDLERS}
      />
    );

    expect(screen.queryByRole('toolbar', { name: 'Textformatierung' })).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
