/**
 * Der Editor-Chunk lädt, sobald ein bearbeitbarer Text auf der Bühne steht —
 * nicht erst beim Doppeltipp (#4384). Sonst käme der Fokus nach der Geste,
 * und iOS zeigte keine Tastatur.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasStage } from '../../primitives/CanvasStage';
import { CanvasText } from '../../primitives/CanvasText';

const loads = vi.hoisted(() => ({ count: 0 }));

vi.mock('../RichTextField', async (importOriginal) => {
  loads.count += 1;
  return importOriginal();
});

afterEach(cleanup);

function stage(editable: boolean) {
  render(
    <CanvasStage width={600} height={600}>
      <CanvasText
        id="text-1"
        x={10}
        y={20}
        width={400}
        fontSize={24}
        text="Klimaschutz"
        editable={editable}
      />
    </CanvasStage>
  );
}

describe('Editor-Chunk vorladen', () => {
  it('lädt nichts für eine reine Anzeige', async () => {
    stage(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(loads.count).toBe(0);
  });

  it('lädt, sobald ein bearbeitbarer Text erscheint', async () => {
    stage(true);
    await vi.waitFor(() => expect(loads.count).toBe(1));
  });
});
