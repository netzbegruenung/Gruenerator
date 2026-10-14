/**
 * Der Text-Editor hängt an `document.body`, die Leinwand nicht. Scrollt die
 * Leinwand in ihrem Container, zoomt sie oder schiebt das Mobile-Sheet sie
 * weg, muss der Editor mitwandern — sonst schwebt er zwischen den Seiten
 * (#4385).
 */
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { CanvasText } from '../../primitives/CanvasText';

let frames: FrameRequestCallback[] = [];

function flushFrames() {
  const pending = frames;
  frames = [];
  act(() => pending.forEach((callback) => callback(0)));
}

beforeEach(() => {
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function rect(top: number, left: number, width: number): DOMRect {
  return {
    top,
    left,
    width,
    height: width,
    right: left + width,
    bottom: top + width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Öffnet den Editor auf einem Feld bei (10, 20) einer 600er-Bühne. */
function editText(wrapper?: HTMLElement) {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600}>
      <CanvasText
        id="text-1"
        x={10}
        y={20}
        width={400}
        fontSize={24}
        text="Klimaschutz"
        editable
        onTextChange={() => {}}
      />
    </CanvasStage>,
    wrapper ? { container: wrapper } : undefined
  );
  const stage = stageRef.current?.getStage();
  const node = stage?.findOne('#text-1');
  if (!stage || !node) throw new Error('Textknoten nicht auf der Bühne gefunden');

  let stageBox = rect(100, 50, 600);
  vi.spyOn(stage.container(), 'getBoundingClientRect').mockImplementation(() => stageBox);
  act(() => {
    node.fire('dblclick');
  });

  const overlay = document.querySelector<HTMLElement>('body > div[style*="z-index: 10000"]');
  if (!overlay) throw new Error('Editor nicht geöffnet');
  return {
    overlay,
    moveStage: (next: DOMRect) => {
      stageBox = next;
    },
  };
}

describe('Text-Editor folgt der Leinwand', () => {
  it('steht beim Öffnen über dem Feld', () => {
    const { overlay } = editText();

    expect(overlay.style.top).toBe('120px');
    expect(overlay.style.left).toBe('60px');
  });

  it('wandert mit, wenn ein Vorfahr der Bühne scrollt', () => {
    const scroller = document.createElement('div');
    document.body.appendChild(scroller);
    const host = document.createElement('div');
    scroller.appendChild(host);
    const { overlay, moveStage } = editText(host);

    moveStage(rect(-20, 50, 600));
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    flushFrames();

    expect(overlay.style.top).toBe('0px');
    expect(overlay.style.left).toBe('60px');
    scroller.remove();
  });

  it('vermisst höchstens einmal je Frame', () => {
    const { overlay, moveStage } = editText();

    moveStage(rect(40, 50, 600));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
    });

    expect(frames).toHaveLength(1);
    expect(overlay.style.top).toBe('120px');
    flushFrames();
    expect(overlay.style.top).toBe('60px');
  });

  it('folgt Zoom und Sheet am Seiten-Container', async () => {
    const pages = document.createElement('div');
    pages.className = 'heterogeneous-multipage__pages-container';
    document.body.appendChild(pages);
    const { overlay, moveStage } = editText(pages);

    // Zoom 2: der Container misst doppelt so breit wie die Bühne.
    moveStage(rect(80, 0, 1200));
    await act(async () => {
      pages.style.setProperty('--canvas-zoom', '2');
      await Promise.resolve();
    });
    flushFrames();

    expect(overlay.style.top).toBe('120px');
    expect(overlay.style.left).toBe('20px');
    expect(overlay.style.width).toBe('800px');
    pages.remove();
  });

  it('hört nach dem Schließen auf zu messen', () => {
    const { moveStage } = editText();
    cleanup();

    moveStage(rect(0, 0, 600));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(frames).toHaveLength(0);
  });
});
