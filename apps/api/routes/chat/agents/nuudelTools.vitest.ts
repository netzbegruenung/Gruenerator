import { describe, expect, it } from 'vitest';

import { toOrder } from './nuudelTools.js';

describe('toOrder', () => {
  it('sortiert Termine und reicht Uhrzeiten je Tag weiter', () => {
    expect(
      toOrder({
        art: 'termin',
        titel: 'OV-Treffen',
        termine: [{ tag: '2026-12-03' }, { tag: '2026-12-01', uhrzeiten: ['18:00'] }],
      })
    ).toEqual({
      kind: 'date',
      title: 'OV-Treffen',
      description: null,
      endDate: null,
      days: [
        { day: '2026-12-01', times: ['18:00'] },
        { day: '2026-12-03', times: [] },
      ],
    });
  });

  it('lehnt eine Terminfindung ohne Termine und eine Auswahl mit einer Option ab', () => {
    expect(toOrder({ art: 'termin', titel: 'OV-Treffen' })).toHaveProperty('error');
    expect(toOrder({ art: 'auswahl', titel: 'Motto', optionen: ['nur eins'] })).toHaveProperty(
      'error'
    );
  });
});
