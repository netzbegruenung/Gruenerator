/**
 * Die Inline-Editoren (Balken, Pille, Kreis-Badge) hängen an `document.body`
 * und rechneten ihre Lage einmal aus. Verschiebt oder vergrössert sich die
 * Bühne während der Bearbeitung — das Seitenpanel öffnet sich, der Browser
 * zoomt —, muss das Feld mitwandern (WCAG 1.4.4 / 1.4.10).
 */
import { act, cleanup, render } from '@testing-library/react';
import { createRef, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BalkenGroup } from '../BalkenGroup';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { CircleBadge } from '../CircleBadge';
import { PillBadge } from '../PillBadge';

import type Konva from 'konva';

vi.hoisted(() => {
  const target = new EventTarget() as EventTarget & {
    check: () => boolean;
    ready: Promise<void>;
    load: () => Promise<never[]>;
  };
  target.check = () => false;
  target.ready = Promise.resolve();
  target.load = () => Promise.resolve([]);
  Object.defineProperty(document, 'fonts', { value: target, configurable: true });
});

let frames: FrameRequestCallback[] = [];
const observers: { callback: () => void; targets: Element[]; disconnected: boolean }[] = [];

function flushFrames() {
  const pending = frames;
  frames = [];
  act(() => pending.forEach((callback) => callback(0)));
}

/** Löst jeden `ResizeObserver` aus, der `target` beobachtet — ohne zu wissen, wer es war. */
function fireObserversOf(target: (el: Element) => boolean) {
  act(() =>
    observers.filter((o) => !o.disconnected && o.targets.some(target)).forEach((o) => o.callback())
  );
}

beforeEach(() => {
  frames = [];
  observers.length = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly entry: (typeof observers)[number];
      constructor(callback: () => void) {
        this.entry = { callback, targets: [], disconnected: false };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.targets.push(target);
      }
      unobserve() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    }
  );
});

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('input, textarea').forEach((el) => el.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const noop = () => {};
const common = {
  onSelect: noop,
  onDragEnd: noop,
  onTransformEnd: noop,
  onSnapChange: noop,
  onSnapLinesChange: noop,
  getSnapTargets: () => [],
  stageWidth: 1080,
  stageHeight: 1080,
};

const KINDS: {
  name: string;
  field: string;
  element: () => ReactElement;
  open: (s: Konva.Stage) => void;
}[] = [
  {
    name: 'Balken',
    field: 'input',
    element: () => (
      <BalkenGroup
        {...common}
        mode="triple"
        colorSchemeId="tanne-sand"
        texts={['Mut zum Wandel', 'Grüne Ideen', 'Gemeinsam gestalten']}
        offset={{ x: 0, y: 0 }}
        scale={1}
        widthScale={1}
        rotation={0}
        selected={false}
        onTextChange={noop}
      />
    ),
    open: (stage) => stage.find<Konva.Text>('Text')[1]!.fire('dblclick'),
  },
  {
    name: 'Pille',
    field: 'textarea',
    element: () => (
      <PillBadge
        {...common}
        id="pill"
        text="Neu"
        x={100}
        y={120}
        backgroundColor="#005437"
        textColor="#fff"
        fontSize={40}
        fontFamily="Arial"
        fontStyle="normal"
        rotation={0}
        scale={1}
        paddingX={20}
        paddingY={10}
        cornerRadius={20}
        selected={false}
        onTextChange={noop}
      />
    ),
    open: (stage) => stage.findOne<Konva.Group>('Group')!.fire('dblclick'),
  },
  {
    name: 'Kreis-Badge',
    field: 'input',
    element: () => (
      <CircleBadge
        {...common}
        id="circle"
        x={300}
        y={300}
        radius={100}
        backgroundColor="#005437"
        textColor="#fff"
        rotation={0}
        scale={1}
        textLines={[{ text: 'Neu', yOffset: 0, fontFamily: 'Arial', fontSize: 40 }]}
        selected={false}
        onTextLineChange={noop}
      />
    ),
    open: (stage) => stage.find<Konva.Text>('Text')[0]!.fire('dblclick'),
  },
];

describe.each(KINDS)('$name-Editor folgt der Bühne', ({ field, element, open }) => {
  function mount() {
    const stageRef = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={stageRef} width={1080} height={1080} responsive={false}>
        {element()}
      </CanvasStage>
    );
    const stage = stageRef.current!.getStage()!;
    const container = stage.container();
    let box = { left: 0, top: 0, width: 1080 };
    container.getBoundingClientRect = () =>
      ({
        ...box,
        height: box.width,
        right: box.left + box.width,
        bottom: box.top + box.width,
      }) as DOMRect;
    return {
      stage,
      container,
      move: (next: Partial<typeof box>) => {
        box = { ...box, ...next };
      },
    };
  }

  it('rückt mit, wenn das Seitenpanel den Container verschiebt', () => {
    const { stage, container, move } = mount();
    act(() => open(stage));
    const input = document.body.querySelector<HTMLElement>(field)!;
    const left = parseFloat(input.style.left);
    const top = parseFloat(input.style.top);

    // Das Panel öffnet sich: der Container wandert nach rechts, ohne seine Grösse zu ändern.
    move({ left: 180 });
    fireObserversOf((el) => el !== container);
    flushFrames();

    expect(parseFloat(input.style.left)).toBeCloseTo(left + 180, 3);
    expect(parseFloat(input.style.top)).toBeCloseTo(top, 3);
  });

  it('skaliert mit, wenn der Container grösser wird (Zoom)', () => {
    const { stage, container, move } = mount();
    act(() => open(stage));
    const input = document.body.querySelector<HTMLElement>(field)!;
    const width = parseFloat(input.style.width);

    move({ width: 2160 });
    fireObserversOf((el) => el === container);
    flushFrames();

    expect(parseFloat(input.style.width)).toBeCloseTo(width * 2, 3);
  });

  it('folgt auch dem Scrollen und der Fenstergrösse, in einem Frame gebündelt', () => {
    const { stage, move } = mount();
    act(() => open(stage));
    const input = document.body.querySelector<HTMLElement>(field)!;
    const top = parseFloat(input.style.top);

    move({ top: 40 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });
    expect(frames).toHaveLength(1);
    flushFrames();

    expect(parseFloat(input.style.top)).toBeCloseTo(top + 40, 3);
  });

  it('hört nach dem Schliessen auf, mitzuwandern', () => {
    const { stage, move } = mount();
    act(() => open(stage));
    const input = document.body.querySelector<HTMLElement>(field)!;

    act(() => input.blur());
    expect(observers.every((o) => o.disconnected)).toBe(true);

    move({ top: 40 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(frames).toHaveLength(0);
  });
});
