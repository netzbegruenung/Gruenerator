import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { FIELD_IDS } from '../types';

import { useBoardState } from './useBoardState';

import type { Row } from '../types';

const IN_PROGRESS = 'row-sample-status-in-progress';

function setup() {
  const ydoc = new Y.Doc();
  const { result } = renderHook(() => useBoardState(ydoc, true));
  const rowById = (id: string) =>
    (ydoc.getArray<Row>('rows').toJSON() as Row[]).find((r) => r.id === id);
  return { result, rowById, ydoc };
}

describe('useBoardState – Erledigt', () => {
  it('„Karte verschieben" nach Erledigt merkt die Herkunft, das Wiederöffnen führt dorthin zurück', () => {
    const { result, rowById } = setup();

    let change = null as ReturnType<typeof result.current.setRowStatus>;
    act(() => {
      change = result.current.setRowStatus(IN_PROGRESS, 'status-done');
    });
    expect(change).toEqual({ spawned: [], completed: true, reopened: false });
    expect(rowById(IN_PROGRESS)?.statusBeforeDone).toBe('status-in-progress');

    act(() => {
      change = result.current.setRowDone(IN_PROGRESS, false);
    });
    expect(change).toEqual({ spawned: [], completed: false, reopened: true });
    expect(rowById(IN_PROGRESS)?.cells[FIELD_IDS.STATUS]).toBe('status-in-progress');
    expect(rowById(IN_PROGRESS)?.statusBeforeDone).toBeUndefined();
  });

  it('eine wiederkehrende Karte erzeugt beim Erledigen ihre nächste Wiederholung', () => {
    const { result, ydoc } = setup();
    act(() => {
      result.current.updateRowCell(IN_PROGRESS, FIELD_IDS.RECURRENCE, 'weekly');
      result.current.updateRowCell(IN_PROGRESS, FIELD_IDS.DUE_DATE, '2026-10-14');
    });

    let change = null as ReturnType<typeof result.current.setRowDone>;
    act(() => {
      change = result.current.setRowDone(IN_PROGRESS, true);
    });

    expect(change?.completed).toBe(true);
    expect(change?.spawned).toHaveLength(1);
    const spawn = (ydoc.getArray<Row>('rows').toJSON() as Row[]).find(
      (r) => r.id === change?.spawned[0].rowId
    );
    expect(spawn?.cells[FIELD_IDS.STATUS]).toBe('status-todo');
    expect(spawn?.cells[FIELD_IDS.DUE_DATE]).toBe('2026-10-21');
  });

  it('meldet keine Änderung, wenn der Status schon stimmt', () => {
    const { result } = setup();
    let change: unknown = 'unset';
    act(() => {
      change = result.current.setRowStatus(IN_PROGRESS, 'status-in-progress');
    });
    expect(change).toBeNull();
    act(() => {
      change = result.current.setRowDone(IN_PROGRESS, false);
    });
    expect(change).toBeNull();
  });
});
