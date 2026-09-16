/**
 * Erreichbarkeit: Ein Doppelklick auf ein bearbeitbares Textfeld öffnet den
 * Rich-Text-Editor mit seiner Werkzeugleiste — auf JEDER Schrift und auch auf
 * Text, der noch keinen Marker trägt.
 *
 * Das ist der Test, der gefehlt hat. Der Editor war fertig, aber nur der
 * Renderer für bereits ausgezeichneten Text zeigte ihn; ein frisches Feld
 * bekam eine von Hand gebaute `<textarea>`. Weil die Werkzeugleiste der
 * einzige Weg zum ersten Marker ist, war Auszeichnung für 21 von 24 Feldern
 * unerreichbar. Ein Test auf `RichTextField` allein sieht davon nichts: die
 * Komponente selbst war die ganze Zeit in Ordnung.
 */
import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStage } from '../CanvasStage';
import { CanvasText } from '../CanvasText';

import type { CanvasStageRef } from '../CanvasStage';

const GRUENE_TYPE = 'GrueneTypeNeue, Arial, sans-serif';
const PT_SANS = 'PT Sans, Arial, sans-serif';

/** Rendert das Feld auf einer echten Bühne und löst den Doppelklick am Knoten aus. */
function dblClickOnCanvas(props: Partial<Parameters<typeof CanvasText>[0]> & { text: string }) {
  // Über `CanvasStage`, nicht über ein nacktes `<Stage>`: dort sitzt der
  // Provider, der den Editor auf der DOM-Seite zeichnet. Genau diese Naht
  // war kaputt — ein Test gegen ein nacktes `<Stage>` würde sie überspringen.
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600}>
      <CanvasText
        id="text-1"
        x={10}
        y={10}
        width={400}
        fontSize={24}
        editable
        onTextChange={() => {}}
        {...props}
      />
    </CanvasStage>
  );

  // react-konva zeichnet auf ein Canvas — der Knoten ist kein DOM-Element,
  // das Ereignis geht deshalb über die Bühne an den Knoten selbst.
  const node = stageRef.current?.getStage()?.findOne('#text-1');
  if (!node) throw new Error('Textknoten nicht auf der Bühne gefunden');
  act(() => {
    node.fire('dblclick');
  });
}

describe('Doppelklick auf Leinwand-Text', () => {
  it('öffnet auf glattem Text den Rich-Text-Editor, nicht mehr eine nackte textarea', () => {
    dblClickOnCanvas({ text: 'Klimaschutz ist kein Sprint', fontFamily: GRUENE_TYPE });

    expect(screen.getByRole('toolbar', { name: 'Textformatierung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Aufzählung$/ })).toBeInTheDocument();
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('öffnet auf bereits ausgezeichnetem Text denselben Editor', () => {
    dblClickOnCanvas({ text: '• Erster Punkt\n• Zweiter Punkt', fontFamily: PT_SANS });

    expect(screen.getByRole('toolbar', { name: 'Textformatierung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fett/ })).toBeInTheDocument();
  });

  it('bietet Fett nur, wo die Schrift einen echten Schnitt hat', () => {
    dblClickOnCanvas({ text: 'Zitat', fontFamily: GRUENE_TYPE });

    expect(screen.queryByRole('button', { name: /Fett/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kursiv/ })).not.toBeInTheDocument();
    // Unterstreichung wird gezeichnet, nicht gesetzt — die gilt überall.
    expect(screen.getByRole('button', { name: /Unterstrichen/ })).toBeInTheDocument();
  });

  it('öffnet nichts, wo das Feld nicht bearbeitbar ist', () => {
    dblClickOnCanvas({ text: 'Nur Anzeige', fontFamily: PT_SANS, editable: false });

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
});
