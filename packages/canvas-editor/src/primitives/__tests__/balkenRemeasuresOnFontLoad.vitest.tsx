/**
 * Ein Balken wird auf React-Seite vermessen (`measureText` gegen
 * GrueneTypeNeue) und das Ergebnis im Memo gehalten. Beim ersten Öffnen ist
 * die Schrift noch nicht da — ein Konva-Paint fordert sie nicht an —, also
 * misst der erste Durchlauf Arial und der Balken wird zu breit. Trifft der
 * Schnitt danach ein, muss der Balken NEU gerechnet werden, nicht erst beim
 * nächsten Regler-Griff.
 */
import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { BalkenGroup } from '../BalkenGroup';

// jsdom kennt kein `document.fonts`; `useFontGeneration` hängt seinen
// `loadingdone`-Listener beim Modul-Import an — also muss das Ziel vorher da sein.
const fonts = vi.hoisted(() => {
  const target = new EventTarget() as EventTarget & {
    check: () => boolean;
    ready: Promise<void>;
    load: () => Promise<never[]>;
  };
  target.check = () => false;
  target.ready = Promise.resolve();
  target.load = () => Promise.resolve([]);
  Object.defineProperty(document, 'fonts', { value: target, configurable: true });
  return target;
});

const measured = vi.hoisted(() => ({ width: 600 }));

// `runMeasurer` selbst, nicht die Messfunktion darunter: die ruft es
// modul-intern, ein gemockter Export erreicht sie nicht.
vi.mock('../../utils/textUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/textUtils')>()),
  runMeasurer: () => () => measured.width,
}));

function firstBarWidth(stageRef: React.RefObject<CanvasStageRef | null>): number {
  const line = stageRef.current?.getStage()?.find('Line')[0];
  if (!line) throw new Error('Kein Balken auf der Bühne');
  const xs = (line as unknown as { points: () => number[] }).points().filter((_, i) => i % 2 === 0);
  return Math.max(...xs) - Math.min(...xs);
}

describe('BalkenGroup nach dem Nachladen der Schrift', () => {
  it('rechnet die Balkenbreite neu, sobald ein Schriftschnitt eintrifft', () => {
    const stageRef = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={stageRef} width={1080} height={1080}>
        <BalkenGroup
          mode="triple"
          colorSchemeId="tanne-sand"
          texts={['Mut zum Wandel', 'Grüne Ideen', 'Gemeinsam gestalten']}
          offset={{ x: 0, y: 0 }}
          scale={1}
          widthScale={1}
          rotation={0}
          selected={false}
          onSelect={() => {}}
          onDragEnd={() => {}}
          onTransformEnd={() => {}}
          onSnapChange={() => {}}
          onSnapLinesChange={() => {}}
          getSnapTargets={() => []}
          stageWidth={1080}
          stageHeight={1080}
        />
      </CanvasStage>
    );

    const withFallbackFont = firstBarWidth(stageRef);

    // Die echte Schrift ist schmaler als Arial.
    measured.width = 200;
    act(() => {
      fonts.dispatchEvent(new Event('loadingdone'));
    });

    expect(firstBarWidth(stageRef)).toBe(withFallbackFont - 400);
  });
});
