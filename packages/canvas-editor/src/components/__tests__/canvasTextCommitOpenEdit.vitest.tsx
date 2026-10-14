/**
 * Ein Host, der gleich schließt, übernimmt den offenen Entwurf vorher (#4397).
 * Ohne Blur — ein Tipp auf den Zurück-Knopf nimmt dem Text auf iOS den Fokus nicht.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { CanvasText } from '../../primitives/CanvasText';
import { commitOpenTextEdit } from '../CanvasTextOverlay';

vi.mock('../RichTextField', () => ({
  RichTextField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Entwurf" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

afterEach(cleanup);

function Host({ stageRef, written }: { stageRef: React.Ref<CanvasStageRef>; written: string[] }) {
  const [text, setText] = useState('Klimaschutz');
  // Wie `useEmitHostStateChanges`: das Dokument erfährt es erst aus einem Effekt.
  useEffect(() => {
    written.push(text);
  }, [text, written]);
  return (
    <CanvasStage ref={stageRef} width={600} height={600}>
      <CanvasText
        id="text-1"
        x={10}
        y={20}
        width={400}
        fontSize={24}
        text={text}
        editable
        onTextChange={setText}
      />
    </CanvasStage>
  );
}

describe('commitOpenTextEdit', () => {
  it('übernimmt den Entwurf samt Effekten, bevor es zurückkehrt', async () => {
    const stageRef = createRef<CanvasStageRef>();
    const written: string[] = [];
    render(<Host stageRef={stageRef} written={written} />);
    const node = stageRef.current?.getStage()?.findOne('#text-1');
    if (!node) throw new Error('Textknoten nicht auf der Bühne gefunden');
    act(() => {
      node.fire('dblclick');
    });
    fireEvent.change(await screen.findByLabelText('Entwurf'), {
      target: { value: 'Klimaschutz jetzt' },
    });

    // Bewusst ohne `act`: das würde Render und Effekte selbst nachziehen.
    commitOpenTextEdit();

    expect(written.at(-1)).toBe('Klimaschutz jetzt');
    expect(screen.queryByLabelText('Entwurf')).toBeNull();
  });

  it('tut ohne offene Sitzung nichts', () => {
    expect(() => commitOpenTextEdit()).not.toThrow();
  });
});
