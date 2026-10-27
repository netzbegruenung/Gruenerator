/**
 * The editor wires the V.i.S.d.P. / Impressum gate into the share popover
 * itself: a poster page reports its state, the download view warns about a
 * placeholder line. A slide deck names the fonts of the country of its first
 * page.
 */
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type CanvasEditorServices } from '../../../CanvasEditorProvider';
import { CanvasEditor } from '../index';

vi.mock('../../../sidebar/UserUploadsProvider', () => ({
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
  it('warns in the download view about a placeholder impressum on a poster', async () => {
    await openDownload(
      {},
      {
        configId: 'freeform',
        formatId: 'print-a3-hoch',
        initialProps: { additionalTexts: [{ id: 'impressum', text: PLACEHOLDER }] },
      }
    );
    for (let i = 0; i < 50 && !screen.queryByText(/kein vollständiges Impressum/); i++)
      await tick();
    expect(screen.getByText(/kein vollständiges Impressum/)).toBeInTheDocument();
    expect(screen.getByText('Impressum ergänzen')).toBeInTheDocument();
  });

  it('names the Austrian fonts for a deck whose first page is Austrian', async () => {
    await openDownload({}, { configId: 'freeform-at', formatId: 'slide-16-9', initialProps: {} });
    expect(await screen.findByText(/Gotham Narrow/)).toBeInTheDocument();
  });
});
