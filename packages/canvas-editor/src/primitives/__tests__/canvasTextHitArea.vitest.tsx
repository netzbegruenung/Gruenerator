/**
 * Ob ein Textfeld ANKLICKBAR ist — die Frage, die `canvasTextEditing` nicht
 * stellen kann.
 *
 * Dort löst `node.fire('dblclick')` das Ereignis direkt am Knoten aus und
 * überspringt damit genau den Schritt, um den es hier geht: Konva sucht erst
 * den Knoten UNTER dem Zeigerpunkt. Eine Gruppe hat dafür keine eigene
 * Fläche, sie fragt ihre Kinder — und die Laufknoten in `CanvasRichText`
 * hören alle nicht zu. Die Gruppe war damit für Maus und Finger nicht
 * vorhanden.
 *
 * Aufgefallen ist es im Betrieb: ein Feld liess sich nach dem Bearbeiten
 * weder bewegen noch erneut öffnen. Der Umschaltpunkt ist der erste Marker
 * oder die erste Auszeichnung — ab da zeichnet `CanvasRichText` statt
 * `CanvasText`, und ab da war das Feld unerreichbar. Endgültig, denn ohne
 * Auswahl gibt es auch keinen Transformer mehr, über den man es noch fassen
 * könnte.
 */
import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { CanvasText } from '../CanvasText';

/** Was Konva unter dem Punkt findet — der echte Weg eines Klicks. */
function treffer(text: string): string | null {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600}>
      <CanvasText
        id="text-1"
        text={text}
        x={10}
        y={10}
        width={400}
        fontSize={24}
        fontFamily="PT Sans, Arial, sans-serif"
        editable
        onTextChange={() => {}}
        onSelect={() => {}}
      />
    </CanvasStage>
  );
  const stage = stageRef.current?.getStage();
  if (!stage) throw new Error('Keine Bühne');
  act(() => {
    stage.draw();
  });
  // Innerhalb des Feldes (x=10, y=10), aber nicht auf einem Glyphen — auf
  // einen Buchstaben zu zielen wäre von der Schriftmessung abhängig.
  const knoten = stage.getIntersection({ x: 20, y: 20 });
  return knoten ? (knoten.findAncestors('Group')[0]?.id() ?? knoten.id()) : null;
}

describe('Trefferfläche eines Textfeldes', () => {
  it('glatter Text lässt sich anfassen', () => {
    expect(treffer('Klimaschutz ist kein Sprint')).toBe('text-1');
  });

  it('Text mit Aufzählung auch', () => {
    expect(treffer('• Klimaschutz ist kein Sprint')).toBe('text-1');
  });

  it('Text mit Auszeichnung auch', () => {
    expect(treffer('**Klimaschutz** ist kein Sprint')).toBe('text-1');
  });
});
