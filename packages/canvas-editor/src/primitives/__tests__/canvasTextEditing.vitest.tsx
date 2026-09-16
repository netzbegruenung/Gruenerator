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
import { createRef, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  CanvasTextEditorProvider,
  useCanvasTextFormatting,
} from '../../components/CanvasTextOverlay';
import { TextFormatControls } from '../../components/TextFormatControls';
import { CanvasStage } from '../CanvasStage';
import { CanvasText } from '../CanvasText';

import type { CanvasStageRef } from '../CanvasStage';

const GRUENE_TYPE = 'GrueneTypeNeue, Arial, sans-serif';
const PT_SANS = 'PT Sans, Arial, sans-serif';

interface StageOptions {
  /** Entwurfsmaße; weichen sie von width/height ab, skaliert CanvasStage eine Gruppe darum. */
  logicalWidth?: number;
  logicalHeight?: number;
}

/** Rendert das Feld auf einer echten Bühne und löst den Doppelklick am Knoten aus. */
function dblClickOnCanvas(
  props: Partial<Parameters<typeof CanvasText>[0]> & { text: string },
  stageOptions: StageOptions = {},
  wrap: (node: ReactNode) => ReactNode = (node) => node
) {
  // Über `CanvasStage`, nicht über ein nacktes `<Stage>`: dort sitzt der
  // Provider, der den Editor auf der DOM-Seite zeichnet. Genau diese Naht
  // war kaputt — ein Test gegen ein nacktes `<Stage>` würde sie überspringen.
  const stageRef = createRef<CanvasStageRef>();
  render(
    wrap(
      <CanvasStage ref={stageRef} width={600} height={600} {...stageOptions}>
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
    )
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

  it('misst den Editor mit dem Maßstab des Knotens, nicht dem der Bühne', () => {
    // Story/Flyer/Plakat: die Entwurfsmaße weichen von den Ausgabemaßen ab,
    // CanvasStage legt dafür eine zusätzlich skalierte Gruppe um den Entwurf.
    // Der Maßstab der Bühne allein kennt sie nicht — der Editor stünde dann
    // an der richtigen Stelle in der falschen Größe über dem Text.
    dblClickOnCanvas(
      { text: 'Skaliert', fontFamily: PT_SANS, width: 100, fontSize: 20 },
      { logicalWidth: 300, logicalHeight: 300 }
    );

    const overlay = document.querySelector<HTMLElement>('body > div[style*="z-index: 10000"]');
    expect(overlay).not.toBeNull();
    // Bühne 600 breit bei 300 Entwurfsbreite = Gruppenmaßstab 2; die Bühne
    // selbst steht mangels Layout in jsdom auf 1. Ein 100 breites Feld misst
    // also 200, nicht 100.
    expect(overlay!.style.width).toBe('200px');
  });

  it('öffnet nichts, wo das Feld nicht bearbeitbar ist', () => {
    dblClickOnCanvas({ text: 'Nur Anzeige', fontFamily: PT_SANS, editable: false });

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
});

/**
 * Der Provider an der Wurzel des Editors und der in `CanvasStage` sind
 * derselbe Baustein. Läge im Editor ein zweiter, hinge der Editor an IHM: die
 * Kopfleiste bekäme nie einen Editor zu sehen, und die schwebende Karte käme
 * zurück. Das sähe aus wie ein Stilfehler und wäre ein Verdrahtungsfehler.
 */
function HostControls() {
  const formatting = useCanvasTextFormatting();
  if (!formatting) return <span data-testid="host">leer</span>;
  return (
    <div data-testid="host">
      <TextFormatControls
        editor={formatting.editor}
        marks={formatting.marks}
        variant="contextBar"
      />
    </div>
  );
}

describe('Bühne innerhalb eines Wirt-Providers', () => {
  it('öffnet keine zweite Sitzung — der Wirt bekommt den Editor', () => {
    dblClickOnCanvas({ text: 'Klimaschutz ist kein Sprint', fontFamily: PT_SANS }, {}, (node) => (
      <CanvasTextEditorProvider controls="host">
        <HostControls />
        {node}
      </CanvasTextEditorProvider>
    ));

    expect(screen.getByTestId('host')).not.toHaveTextContent('leer');
    expect(screen.getAllByRole('toolbar', { name: 'Textformatierung' })).toHaveLength(1);
    // Die Karte über dem Text bleibt aus: der Wirt zeigt die Knöpfe.
    expect(document.querySelector('.canvas-rte__floating-toolbar')).toBeNull();
    // Der Editor selbst steht trotzdem — nur eben ohne eigene Leiste.
    expect(document.querySelector('.canvas-rte__content')).not.toBeNull();
  });

  it('zeigt die Karte weiterhin, wo keine Kopfleiste darüber liegt', () => {
    // `StandaloneCanvas`: Bühne ohne Editor-Rahmen. Ohne diesen Zweig verlöre
    // der Pfad jede Formatierung.
    dblClickOnCanvas({ text: 'Klimaschutz ist kein Sprint', fontFamily: PT_SANS });

    expect(document.querySelector('.canvas-rte__floating-toolbar')).not.toBeNull();
  });
});
