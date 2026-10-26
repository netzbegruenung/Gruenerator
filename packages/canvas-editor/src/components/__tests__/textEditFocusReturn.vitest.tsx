/**
 * Nach dem Text-Bearbeiten (Escape oder Übernehmen) geht der Fokus dorthin
 * zurück, wo die Bearbeitung begann: zum Ebenen-Eintrag, sonst auf den
 * Knopf der Seite. Wer woanders hinklickt, behält, was er angeklickt hat.
 * Gilt für den Text-Editor (`CanvasTextOverlay`) und die Zeilen-Editoren
 * von Balken, Pille und Kreis-Badge.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BalkenGroup } from '../../primitives/BalkenGroup';
import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { CanvasText } from '../../primitives/CanvasText';
import { CircleBadge } from '../../primitives/CircleBadge';
import { PillBadge } from '../../primitives/PillBadge';

import type Konva from 'konva';

// jsdom kennt kein `document.fonts`; `useFontGeneration` hängt seinen
// `loadingdone`-Listener beim Modul-Import an — also muss das Ziel vorher da sein.
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

vi.mock('../RichTextField', () => ({
  RichTextField: ({
    value,
    onChange,
    onBlur,
    onEscape,
  }: {
    value: string;
    onChange: (v: string) => void;
    onBlur?: () => void;
    onEscape?: () => void;
  }) => (
    <textarea
      aria-label="Entwurf"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onEscape?.();
      }}
    />
  ),
}));

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('input, textarea').forEach((el) => el.remove());
});

/** Eine Seite wie im Editor: Knopf „Seite 1 bearbeiten", daneben die Ebenen-Liste. */
function Page({
  children,
  stageRef,
}: {
  children: ReactNode;
  stageRef: React.Ref<CanvasStageRef>;
}) {
  return (
    <div className="canvas-editor-layout">
      <div role="listbox" aria-label="Ebenen">
        <div role="option" aria-selected="true" tabIndex={0} data-layer-id="el-1">
          Text
        </div>
      </div>
      <div className="heterogeneous-multipage__page-wrapper" role="group" aria-label="Seite 1">
        <button type="button" data-page-focus-target="p1">
          Seite 1 bearbeiten
        </button>
        <CanvasStage ref={stageRef} width={1080} height={1080} responsive={false}>
          {children}
        </CanvasStage>
      </div>
      <button type="button">Woanders</button>
    </div>
  );
}

const option = () => screen.getByRole('option', { name: 'Text' });
const pageTarget = () => screen.getByRole('button', { name: 'Seite 1 bearbeiten' });

function startEdit(stage: Konva.Stage, selector: string, index = 0) {
  const node = stage.find(selector)[index];
  if (!node) throw new Error(`${selector} nicht auf der Bühne`);
  act(() => {
    // Bis zur Gruppe: die Pille hört dort, Balken und Kreis am Textknoten.
    node.fire('dblclick', {}, true);
  });
}

describe('Text-Editor (CanvasTextOverlay)', () => {
  function mount() {
    const stageRef = createRef<CanvasStageRef>();
    render(
      <Page stageRef={stageRef}>
        <CanvasText id="el-1" x={10} y={20} width={400} fontSize={24} text="Klima" editable />
      </Page>
    );
    return stageRef.current!.getStage()!;
  }

  it('Escape gibt den Fokus an den Ebenen-Eintrag zurück, von dem die Bearbeitung kam', async () => {
    const stage = mount();
    option().focus();
    startEdit(stage, '#el-1');
    const field = await screen.findByLabelText('Entwurf');
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(option()).toHaveFocus());
  });

  it('geht sonst auf den Knopf der Seite', async () => {
    const stage = mount();
    startEdit(stage, '#el-1');
    const field = await screen.findByLabelText('Entwurf');
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(pageTarget()).toHaveFocus());
  });

  it('lässt einem angeklickten Knopf den Fokus', async () => {
    const stage = mount();
    option().focus();
    startEdit(stage, '#el-1');
    const field = await screen.findByLabelText('Entwurf');
    field.focus();
    const elsewhere = screen.getByRole('button', { name: 'Woanders' });
    elsewhere.focus();
    await waitFor(() => expect(screen.queryByLabelText('Entwurf')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(elsewhere).toHaveFocus();
  });
});

describe('Zeilen-Editoren', () => {
  function mountBalken() {
    const stageRef = createRef<CanvasStageRef>();
    render(
      <Page stageRef={stageRef}>
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
          onTextChange={() => {}}
          onSnapChange={() => {}}
          onSnapLinesChange={() => {}}
          getSnapTargets={() => []}
          stageWidth={1080}
          stageHeight={1080}
        />
      </Page>
    );
    return stageRef.current!.getStage()!;
  }

  function mountPill() {
    const stageRef = createRef<CanvasStageRef>();
    render(
      <Page stageRef={stageRef}>
        <PillBadge
          id="pill-1"
          text="Neu"
          x={100}
          y={100}
          backgroundColor="#005538"
          textColor="#ffffff"
          fontFamily="PT Sans"
          fontSize={40}
          fontStyle="bold"
          rotation={0}
          scale={1}
          paddingX={20}
          paddingY={10}
          cornerRadius={20}
          selected={false}
          onSelect={() => {}}
          onDragEnd={() => {}}
          onTransformEnd={() => {}}
          onTextChange={() => {}}
          onSnapChange={() => {}}
          onSnapLinesChange={() => {}}
          getSnapTargets={() => []}
          stageWidth={1080}
          stageHeight={1080}
        />
      </Page>
    );
    return stageRef.current!.getStage()!;
  }

  function mountCircle() {
    const stageRef = createRef<CanvasStageRef>();
    render(
      <Page stageRef={stageRef}>
        <CircleBadge
          id="circle-1"
          x={300}
          y={300}
          radius={120}
          backgroundColor="#005538"
          textColor="#ffffff"
          rotation={0}
          scale={1}
          textLines={[
            { text: 'Jetzt', yOffset: 0, fontSize: 40, fontFamily: 'PT Sans', fontWeight: 'bold' },
          ]}
          selected={false}
          onSelect={() => {}}
          onDragEnd={() => {}}
          onTransformEnd={() => {}}
          onTextLineChange={() => {}}
          onSnapChange={() => {}}
          onSnapLinesChange={() => {}}
          getSnapTargets={() => []}
          stageWidth={1080}
          stageHeight={1080}
        />
      </Page>
    );
    return stageRef.current!.getStage()!;
  }

  const editors = [
    { name: 'Balken', mount: mountBalken, field: 'Zeile 1 bearbeiten' },
    { name: 'Pille', mount: mountPill, field: 'Text bearbeiten' },
    { name: 'Kreis-Badge', mount: mountCircle, field: 'Text bearbeiten' },
  ];

  it.each(editors)('$name: Escape gibt den Fokus an den Ebenen-Eintrag zurück', async (e) => {
    const stage = e.mount();
    option().focus();
    startEdit(stage, 'Text');
    const field = screen.getByLabelText(e.field);
    expect(field).toHaveFocus();
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(option()).toHaveFocus());
  });

  it.each(editors)('$name: Enter geht ohne Ebenen-Ursprung auf die Seite', async (e) => {
    const stage = e.mount();
    startEdit(stage, 'Text');
    const field = screen.getByLabelText(e.field);
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(pageTarget()).toHaveFocus());
  });

  it.each(editors)('$name: Tab übernimmt und landet nicht im Nirgendwo', async (e) => {
    const stage = e.mount();
    option().focus();
    startEdit(stage, 'Text');
    const field = screen.getByLabelText(e.field);
    fireEvent.keyDown(field, { key: 'Tab' });
    expect(screen.queryByLabelText(e.field)).toBeNull();
    await waitFor(() => expect(option()).toHaveFocus());
  });
});
