/**
 * Der Befund, den dieser Test festhält, war der schwerste Einzelposten des
 * Barrierefreiheits-Baseline-Laufs: 315 Vorkommen `nested-interactive` auf
 * `/boards`. Ursache war nicht unser Markup, sondern dnd-kits Vorgabe
 * `role="button"` + `tabIndex={0}` auf dem Sortier-Wrapper — jede Karte war
 * damit ein Bedienelement, das ein weiteres enthielt (WCAG 4.1.2).
 *
 * Warum als Komponententest und nicht in der axe-Lane: die Lane prüft Routen
 * mit echten Daten. Ein leeres Board rendert gar keinen Wrapper, und ein
 * Nicht-Befund ohne Daten ist kein Beleg — genau daran ist die erste
 * Nachmessung gescheitert. Hier stehen die Karten immer da.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { KanbanBoard, KanbanCard, KanbanCards, KanbanProvider } from './index';

const columns = [{ id: 'todo', name: 'Zu erledigen' }];
const data = [
  { id: 'karte-1', name: 'Antrag schreiben', column: 'todo' },
  { id: 'karte-2', name: 'Rede kürzen', column: 'todo' },
];

function renderBoard() {
  return render(
    <KanbanProvider columns={columns} data={data} onDataChange={vi.fn()}>
      {(column) => (
        <KanbanBoard key={column.id} id={column.id}>
          <KanbanCards id={column.id}>
            {(item) => (
              <KanbanCard key={item.id} {...item}>
                {/* Stellvertreter für CardContent: die Karte selbst ist das
                    Bedienelement, das die Detailansicht öffnet. */}
                <div role="button" tabIndex={0} onKeyDown={vi.fn()} onClick={vi.fn()}>
                  {item.name}
                </div>
              </KanbanCard>
            )}
          </KanbanCards>
        </KanbanBoard>
      )}
    </KanbanProvider>
  );
}

describe('KanbanCard', () => {
  it('macht den Sortier-Wrapper nicht selbst zum Bedienelement', () => {
    renderBoard();

    const karte = screen.getByRole('button', { name: 'Antrag schreiben' });
    // Zwischen der Karte und dem Spaltencontainer darf kein weiteres
    // interaktives Element liegen. Genau dort saß dnd-kits role="button".
    for (let el = karte.parentElement; el; el = el.parentElement) {
      expect(el).not.toHaveAttribute('role', 'button');
      expect(el).not.toHaveAttribute('tabindex', '0');
    }
  });

  it('bietet das Verschieben als eigenen, benannten Griff an', () => {
    renderBoard();

    // Ein Griff je Karte, mit dem Kartennamen im Namen — sonst hört eine
    // Screenreader-Nutzerin zweimal „Karte verschieben" ohne Unterschied.
    expect(
      screen.getByRole('button', { name: 'Karte „Antrag schreiben" verschieben' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Karte „Rede kürzen" verschieben' })).toBeVisible();
  });

  it('lässt den Griff per Tastatur erreichbar', () => {
    renderBoard();

    const griff = screen.getByRole('button', { name: 'Karte „Antrag schreiben" verschieben' });
    // dnd-kits KeyboardSensor hängt an genau diesem Element; ohne Tabstopp
    // gäbe es keine Tastaturbedienung fürs Verschieben mehr.
    expect(griff).not.toHaveAttribute('tabindex', '-1');
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = renderBoard();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('behält die Karte als eigenes Bedienelement', () => {
    renderBoard();

    const spalte = screen.getByText('Antrag schreiben').closest('[class*="group/kanban-card"]');
    expect(spalte).not.toBeNull();
    // Karte und Griff sind Geschwister, nicht verschachtelt.
    expect(within(spalte as HTMLElement).getAllByRole('button')).toHaveLength(2);
  });
});

/**
 * GlitchTip #540/#471 (drei Ereignisse 08–09/2026, alle auf demselben Board):
 * React #185 aus dem Layout-Effekt von tunnel-rats `In`, also mit einer Karte,
 * die das Board für „aktiv gezogen" hielt. dnd-kit bricht ein Ziehen auch ohne
 * Loslassen ab — Escape, oder `visibilitychange`, wenn der Rechner in den
 * Ruhezustand geht; zwei der drei Ereignisse kamen Sekunden nach dem
 * Aufwachen. `KanbanProvider` verarbeitete nur `onDragEnd`, also blieb
 * `activeCardId` nach einem Abbruch stehen und mit ihm der Tunnel-`In` der
 * Karte.
 *
 * Sichtbar wird das erst mit zwei Lanes (Swimlanes rendern je einen
 * Provider, der Tunnel ist modulweit): die stehen gebliebene Karte taucht im
 * Overlay des nächsten Ziehens in der anderen Lane mit auf.
 */
describe('KanbanProvider bei abgebrochenem Ziehen', () => {
  const lane = (laneId: string, item: { id: string; name: string }, onDragCancel = vi.fn()) => (
    <KanbanProvider
      key={laneId}
      columns={[{ id: `${laneId}-todo`, name: 'Zu erledigen' }]}
      data={[{ ...item, column: `${laneId}-todo` }]}
      onDataChange={vi.fn()}
      onDragCancel={onDragCancel}
    >
      {(column) => (
        <KanbanBoard key={column.id} id={column.id}>
          <KanbanCards id={column.id}>
            {(card) => (
              <KanbanCard key={card.id} {...card}>
                <div>{card.name}</div>
              </KanbanCard>
            )}
          </KanbanCards>
        </KanbanBoard>
      )}
    </KanbanProvider>
  );

  const griff = (name: string) =>
    screen.getByRole('button', { name: `Karte „${name}" verschieben` });
  const ziehen = async (name: string) => {
    const g = griff(name);
    g.focus();
    await act(async () => {
      fireEvent.keyDown(g, { code: 'Space', key: ' ' });
    });
  };

  it.each([
    [
      'visibilitychange',
      () => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
    ],
    [
      'Escape',
      () =>
        fireEvent.keyDown(document.activeElement ?? document.body, {
          code: 'Escape',
          key: 'Escape',
        }),
    ],
  ])('vergisst die aktive Karte nach einem Abbruch per %s', async (_name, abbrechen) => {
    const onDragCancel = vi.fn();
    render(
      <>
        {lane('a', { id: 'karte-a', name: 'Antrag schreiben' }, onDragCancel)}
        {lane('b', { id: 'karte-b', name: 'Rede kürzen' })}
      </>
    );

    await ziehen('Antrag schreiben');
    // Die Karte liegt jetzt doppelt vor: im Board und als Kopie im DragOverlay.
    expect(screen.getAllByText('Antrag schreiben')).toHaveLength(2);

    await act(async () => {
      abbrechen();
    });
    expect(onDragCancel).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Antrag schreiben')).toHaveLength(1);

    await ziehen('Rede kürzen');
    expect(screen.getAllByText('Rede kürzen')).toHaveLength(2);
    // Vor der Reparatur stand hier die abgebrochene Karte ein zweites Mal.
    expect(screen.getAllByText('Antrag schreiben')).toHaveLength(1);
  });
});
