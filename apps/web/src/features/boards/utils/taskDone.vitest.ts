import { describe, expect, it } from 'vitest';

import { FIELD_IDS } from '../types';

import { DEFAULT_FIELDS } from './boardDefaults';
import {
  getDoneStatusId,
  nextOccurrence,
  reopenStatusId,
  setDoneOption,
  withStatus,
} from './taskDone';

import type { Field, Row, SelectOption } from '../types';

function statusField(options: SelectOption[]): Field {
  return {
    id: FIELD_IDS.STATUS,
    name: 'Status',
    type: 'singleSelect',
    typeOptions: { options },
    order: 1,
  };
}

function row(status: string, extra: Partial<Row> = {}): Row {
  return {
    id: 'r1',
    cells: { [FIELD_IDS.TITLE]: 'Infostand', [FIELD_IDS.STATUS]: status },
    createdBy: 'u1',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  };
}

const TEMPLATE_OPTIONS: SelectOption[] = [
  { id: 'status-backlog', name: 'Backlog', color: '' },
  { id: 'status-in-arbeit', name: 'In Arbeit', color: '' },
  { id: 'status-erledigt', name: 'Erledigt', color: '' },
];

describe('getDoneStatusId', () => {
  it('erkennt die Erledigt-Spalte des Standard-Boards ohne Markierung', () => {
    expect(getDoneStatusId(DEFAULT_FIELDS)).toBe('status-done');
  });

  it('erkennt Vorlagen- und Chat-Boards über Id oder Namen', () => {
    expect(getDoneStatusId([statusField(TEMPLATE_OPTIONS)])).toBe('status-erledigt');
    expect(
      getDoneStatusId([
        statusField([
          { id: 'status-1', name: 'Offen', color: '' },
          { id: 'status-2', name: ' Erledigt ', color: '' },
        ]),
      ])
    ).toBe('status-2');
  });

  it('bevorzugt die ausdrücklich markierte Spalte', () => {
    const options = TEMPLATE_OPTIONS.map((o) =>
      o.id === 'status-in-arbeit' ? { ...o, isDone: true } : o
    );
    expect(getDoneStatusId([statusField(options)])).toBe('status-in-arbeit');
  });

  it('respektiert ein ausdrückliches Abwählen der Rückfall-Spalte', () => {
    expect(getDoneStatusId([statusField(setDoneOption(TEMPLATE_OPTIONS, null))])).toBeNull();
  });

  it('liefert null ohne Status-Feld oder ohne passende Spalte', () => {
    expect(getDoneStatusId([])).toBeNull();
    expect(getDoneStatusId([statusField([{ id: 'a', name: 'Idee', color: '' }])])).toBeNull();
  });
});

describe('setDoneOption', () => {
  it('markiert genau eine Spalte und lässt die übrigen Felder stehen', () => {
    const options = setDoneOption(
      [{ ...TEMPLATE_OPTIONS[0], limit: 3 }, ...TEMPLATE_OPTIONS.slice(1)],
      'status-backlog'
    );
    expect(options.map((o) => o.isDone)).toEqual([true, false, false]);
    expect(options[0].limit).toBe(3);
  });
});

describe('withStatus', () => {
  it('merkt sich beim Erledigen die vorige Spalte', () => {
    const next = withStatus(row('status-in-arbeit'), 'status-erledigt', 'status-erledigt');
    expect(next.cells[FIELD_IDS.STATUS]).toBe('status-erledigt');
    expect(next.statusBeforeDone).toBe('status-in-arbeit');
  });

  it('vergisst die vorige Spalte, sobald die Karte die Erledigt-Spalte verlässt', () => {
    const done = row('status-erledigt', { statusBeforeDone: 'status-in-arbeit' });
    const next = withStatus(done, 'status-backlog', 'status-erledigt');
    expect(next.statusBeforeDone).toBeUndefined();
    expect('statusBeforeDone' in next).toBe(false);
  });

  it('gibt dieselbe Zeile zurück, wenn sich nichts ändert', () => {
    const r = row('status-backlog');
    expect(withStatus(r, 'status-backlog', 'status-erledigt')).toBe(r);
  });
});

describe('reopenStatusId', () => {
  const fields = [statusField(TEMPLATE_OPTIONS)];

  it('führt in die gemerkte Spalte zurück', () => {
    const done = row('status-erledigt', { statusBeforeDone: 'status-in-arbeit' });
    expect(reopenStatusId(done, fields, 'status-erledigt')).toBe('status-in-arbeit');
  });

  it('fällt auf die erste offene Spalte zurück, wenn die gemerkte fehlt', () => {
    expect(reopenStatusId(row('status-erledigt'), fields, 'status-erledigt')).toBe(
      'status-backlog'
    );
    const gone = row('status-erledigt', { statusBeforeDone: 'status-geloescht' });
    expect(reopenStatusId(gone, fields, 'status-erledigt')).toBe('status-backlog');
  });
});

describe('nextOccurrence', () => {
  const recurring = (status: string) =>
    row(status, {
      cells: {
        [FIELD_IDS.TITLE]: 'Wochenbericht',
        [FIELD_IDS.STATUS]: status,
        [FIELD_IDS.DUE_DATE]: '2026-10-14',
        [FIELD_IDS.RECURRENCE]: 'weekly',
        [FIELD_IDS.COMMENTS]: '[{"id":"c1"}]',
      },
    });

  it('legt die nächste Wiederholung im Standard-Board in „Zu erledigen" an', () => {
    const next = nextOccurrence(recurring('status-in-progress'), DEFAULT_FIELDS, 'status-done');
    expect(next?.row.cells[FIELD_IDS.STATUS]).toBe('status-todo');
    expect(next?.row.cells[FIELD_IDS.DUE_DATE]).toBe('2026-10-21');
    expect(next?.row.cells[FIELD_IDS.COMMENTS]).toBe('[]');
    expect(next?.dueDate).toBe('2026-10-21');
  });

  it('nimmt auf Vorlagen-Boards die erste offene Spalte', () => {
    const next = nextOccurrence(
      recurring('status-in-arbeit'),
      [statusField(TEMPLATE_OPTIONS)],
      'status-erledigt'
    );
    expect(next?.row.cells[FIELD_IDS.STATUS]).toBe('status-backlog');
  });

  it('liefert null für Karten ohne Wiederholung', () => {
    expect(nextOccurrence(row('status-todo'), DEFAULT_FIELDS, 'status-done')).toBeNull();
  });
});
