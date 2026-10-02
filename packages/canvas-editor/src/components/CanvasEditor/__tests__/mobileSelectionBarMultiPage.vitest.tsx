/**
 * Die Auswahl-Leiste unten (mobil) und die Pille rufen über `useToolbarHandlers`
 * in die aktive Seite. Der React-Compiler baut diese Handler genau einmal und
 * hält fest, was `canvasRefsRef.current[currentPageIndex]` beim ERSTEN Render
 * war — im Collab-Editor nichts, weil die Seiten erst nach dem Sync kommen.
 * Dann sah die Leiste lebendig aus und tat nichts: „60" blieb beim Tippen auf
 * „+" einfach „60", Duplizieren und Löschen in der Pille ebenso.
 *
 * Nachgestellt mit zwei Dreizeiler-Seiten: der Text wird angetippt, „+" muss
 * die Größe ändern — auf Seite 1 und nach dem Seitenwechsel auf Seite 2.
 */
import { act, render, screen, within } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditor } from '../index';

// Der Upload-Provider zieht react-query mit einer zweiten React-Kopie herein;
// hier geht es um die Fläche, nicht um die Mediathek.
vi.mock('../../../sidebar/UserUploadsProvider', () => ({
  UserUploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserUploads: () => ({ uploads: [], refresh: () => {} }),
}));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

// Mobil: `useIsCanvasMobile` fragt `(max-width: 899px)`.
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
);

// Der Miniaturen-Streifen rastert jede Seite; jsdoms Canvas kann napi-rs
// nicht in ein Bild kopieren, und das Bild prüft hier niemand.
vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockReturnValue('data:,');
// jsdom macht kein Layout: der Seitenwechsel scrollt die Seite ins Bild.
Element.prototype.scrollIntoView ??= () => {};

const headerText = (id: string) => ({
  id,
  text: 'Neue Überschrift',
  type: 'header',
  x: 100,
  y: 100,
  fontSize: 60,
  fontFamily: 'GrueneTypeNeue, Arial, sans-serif',
  fontStyle: 'bold',
  fill: '#ffffff',
  width: 400,
});

async function renderTwoPages() {
  await act(async () => {
    render(
      <CanvasEditor
        initialConfigId="dreizeilen"
        initialProps={{}}
        initialPages={[
          { id: 'p1', configId: 'dreizeilen', state: { additionalTexts: [headerText('text-1')] } },
          { id: 'p2', configId: 'dreizeilen', state: { additionalTexts: [headerText('text-2')] } },
        ]}
        onExport={() => {}}
        onCancel={() => {}}
      />
    );
  });
  // Die Vorlage lädt asynchron; erst dann stehen die Bühnen.
  for (let i = 0; i < 50 && Konva.stages.length < 2; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  expect(Konva.stages.length).toBe(2);
}

async function tapText(stage: Konva.Stage, id: string): Promise<Konva.Text> {
  const node = stage.findOne<Konva.Text>(`#${id}`);
  expect(node, `Textknoten ${id}`).toBeTruthy();
  await act(async () => {
    node!.fire('tap', { evt: {} }, true);
  });
  return node!;
}

async function pressBigger() {
  const bar = await screen.findByRole('toolbar', { name: 'Auswahl bearbeiten' });
  expect(within(bar).getByText('60')).toBeInTheDocument();
  await act(async () => {
    within(bar).getByTitle('Schrift vergrößern').click();
  });
  return bar;
}

describe('mobile Auswahl-Leiste im Mehrseiten-Editor', () => {
  it('„Schrift vergrößern" ändert den angetippten Text auf Seite 1', async () => {
    await renderTwoPages();
    const node = await tapText(Konva.stages[0]!, 'text-1');
    const bar = await pressBigger();
    expect(within(bar).getByText('62')).toBeInTheDocument();
    expect(node.fontSize()).toBe(62);
  });

  it('folgt nach dem Seitenwechsel der Seite 2', async () => {
    await renderTwoPages();
    await act(async () => {
      // Die Miniatur im Streifen; die Seite selbst trägt denselben Namen.
      const strip = document.querySelector('.page-thumbnail-strip');
      expect(strip).toBeTruthy();
      within(strip as HTMLElement)
        .getByRole('button', { name: 'Seite 2' })
        .click();
    });
    const node = await tapText(Konva.stages[1]!, 'text-2');
    const bar = await pressBigger();
    expect(within(bar).getByText('62')).toBeInTheDocument();
    expect(node.fontSize()).toBe(62);
    expect(Konva.stages[0]!.findOne<Konva.Text>('#text-1')!.fontSize()).toBe(60);
  });
});
