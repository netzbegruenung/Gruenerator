/**
 * The editor wires the V.i.S.d.P. / Impressum gate into the share popover
 * itself: a poster page reports its state, the download view warns about a
 * placeholder line — given the host's print service, which apps/web always
 * passes. A slide deck names the fonts of the country of its first page.
 */
import {
  CanvasEditorProvider,
  type CanvasEditorServices,
} from '@ggraphic/editor/CanvasEditorProvider';
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { grueneratorPrint } from '../../../composer/printService';
import { grueneratorCarousel } from '../../../composer/sharepicServices';
import { CanvasEditor } from '../index';

vi.mock('@ggraphic/editor/sidebar/UserUploadsProvider', () => ({
  useOptionalUserUploads: () => null,
  UserUploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserUploads: () => ({ uploads: [], refresh: () => {} }),
}));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
);

vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockReturnValue('data:,');
Element.prototype.scrollIntoView ??= () => {};

const PLACEHOLDER = 'V.i.S.d.P.: Vorname Nachname, Straße Nr., PLZ Ort';

const tick = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

async function openDownload(
  services: CanvasEditorServices,
  props: {
    configId: React.ComponentProps<typeof CanvasEditor>['initialConfigId'];
    formatId: string;
    initialProps: Record<string, unknown>;
  }
) {
  await act(async () => {
    render(
      <CanvasEditorProvider services={services}>
        <CanvasEditor
          initialConfigId={props.configId}
          formatId={props.formatId}
          initialProps={props.initialProps}
          onExport={() => {}}
          onCancel={() => {}}
        />
      </CanvasEditorProvider>
    );
  });
  for (let i = 0; i < 50 && !screen.queryByRole('button', { name: /Teilen/ }); i++) await tick();
  await act(async () => {
    screen.getByRole('button', { name: /Teilen/ }).click();
  });
  await act(async () => {
    screen.getByRole('button', { name: 'Download' }).click();
  });
}

describe('CanvasEditor: print impressum wiring', () => {
  const POSTER = {
    configId: 'freeform' as const,
    formatId: 'print-a3-hoch',
    initialProps: { additionalTexts: [{ id: 'impressum', text: PLACEHOLDER }] },
  };

  it('warns in the download view about a placeholder impressum on a poster', async () => {
    await openDownload({ print: grueneratorPrint }, POSTER);
    for (let i = 0; i < 50 && !screen.queryByText(/kein vollständiges Impressum/); i++)
      await tick();
    expect(screen.getByText(/kein vollständiges Impressum/)).toBeInTheDocument();
    expect(screen.getByText('Impressum ergänzen')).toBeInTheDocument();
  });

  it('has no impressum warning or form without the print service', async () => {
    await openDownload({}, POSTER);
    expect(await screen.findByRole('button', { name: /Herunterladen/ })).toBeInTheDocument();
    for (let i = 0; i < 10; i++) await tick();
    expect(screen.queryByText(/kein vollständiges Impressum/)).toBeNull();
    expect(screen.queryByText('Impressum ergänzen')).toBeNull();
  });

  it('names the Austrian fonts for a deck whose first page is Austrian', async () => {
    await openDownload(
      { carousel: grueneratorCarousel },
      { configId: 'freeform-at', formatId: 'slide-16-9', initialProps: {} }
    );
    expect(await screen.findByText(/Gotham Narrow/)).toBeInTheDocument();
  });
});
