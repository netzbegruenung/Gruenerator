/**
 * "Dieses Notebook hat noch keine Quellen" ist die härteste Aussage dieses
 * Hinweises — sie sagt Leuten, ihre Quellen seien weg. Sie erschien in vollen
 * Notebooks, weil eine leere Dokumentliste am Client aussieht wie ein leeres
 * Notebook, egal warum sie leer ankam.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import NotebookIndexingNotice, { resolveIndexingState } from './NotebookIndexingNotice';

const LEER_MELDUNG = /hat noch keine Quellen/;

describe('resolveIndexingState', () => {
  it('übernimmt den Zustand, den der Server festgestellt hat', () => {
    expect(resolveIndexingState({ indexing_state: 'empty', documents: [] })).toBe('empty');
    expect(resolveIndexingState({ indexing_state: 'ready', documents: [] })).toBe('ready');
  });

  it('leitet "leer" niemals selbst ab', () => {
    // Eine leere Liste kann heißen: wirklich leer, ein Backend ohne
    // `indexing_state`, oder ein gescheiterter Lookup. Der Client kann die drei
    // nicht auseinanderhalten, also behauptet er keinen davon.
    expect(resolveIndexingState({ documents: [] })).toBeNull();
    expect(resolveIndexingState({})).toBeNull();
    expect(resolveIndexingState({ indexing_state: null, documents: [] })).toBeNull();
  });

  it('leitet die übrigen Zustände weiter ab — sie haben echte Zeilen als Beleg', () => {
    expect(resolveIndexingState({ documents: [{ status: 'processing' }] })).toBe('indexing');
    expect(resolveIndexingState({ documents: [{ status: 'failed' }] })).toBe('failed');
    expect(
      resolveIndexingState({ documents: [{ status: 'failed' }, { status: 'completed' }] })
    ).toBe('partial');
    expect(resolveIndexingState({ documents: [{ status: 'completed' }] })).toBe('ready');
  });
});

describe('NotebookIndexingNotice', () => {
  const renderNotice = (state: Parameters<typeof NotebookIndexingNotice>[0]['state']) =>
    render(
      <MemoryRouter>
        <NotebookIndexingNotice state={state} />
      </MemoryRouter>
    );

  it('zeigt die Leer-Meldung, wenn der Server das Notebook als leer meldet', () => {
    renderNotice('empty');

    expect(screen.getByText(LEER_MELDUNG)).toBeInTheDocument();
  });

  it('schweigt bei unbekanntem Zustand', () => {
    const { container } = renderNotice(null);

    expect(container).toBeEmptyDOMElement();
  });
});
