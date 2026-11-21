import { describe, expect, it } from 'vitest';

import {
  createInputSchema,
  editInputSchema,
  foreignPollRef,
  toEdit,
  toOrder,
} from './nuudelTools.js';

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

describe('createInputSchema', () => {
  const schema = createInputSchema('2026-11-19');

  it('lehnt vergangene Termine und ein vergangenes Ablaufdatum ab, bevor das Gate fragt', () => {
    const past = schema.safeParse({
      art: 'termin',
      titel: 'OV-Treffen',
      termine: [{ tag: '2026-11-03' }, { tag: '2026-11-20' }],
    });
    expect(past.success).toBe(false);
    expect(past.error?.issues[0]?.message).toContain('2026-11-03');
    expect(
      schema.safeParse({ art: 'auswahl', titel: 'Motto', optionen: ['a', 'b'], ende: '2026-11-18' })
        .success
    ).toBe(false);
  });

  it('nimmt heute und spätere Tage an', () => {
    expect(
      schema.safeParse({ art: 'termin', titel: 'OV-Treffen', termine: [{ tag: '2026-11-19' }] })
        .success
    ).toBe(true);
  });
});

describe('foreignPollRef', () => {
  const own = {
    id: 'a1b2',
    kind: 'date' as const,
    title: 'OV-Treffen',
    pollUrl: 'https://nuudel.digitalcourage.de/bkXQBlgrsox7OSDP',
    adminUrl: 'https://nuudel.digitalcourage.de/bkXQBlgrsox7OSDPZGBJ9gm4/admin',
    createdAt: new Date('2026-11-19T00:00:00Z'),
  };

  it('meldet einen fremden Link, auch ohne eigene Umfragen', () => {
    const link = 'https://nuudel.digitalcourage.de/aBcDeFgHiJkLmNoP';
    expect(foreignPollRef([], `Werte bitte ${link} aus`)).toBe(link);
    expect(foreignPollRef([own], link)).toBe(link);
  });

  it('lässt eigene Links und Titel durch', () => {
    expect(foreignPollRef([own], own.pollUrl)).toBeNull();
    expect(foreignPollRef([own], own.adminUrl)).toBeNull();
    expect(foreignPollRef([own], 'OV-Treffen')).toBeNull();
    expect(foreignPollRef([own], null)).toBeNull();
  });
});

describe('Datumsprüfung', () => {
  it('lehnt Tage ab, die es nicht gibt, statt sie wie nuudel weiterzurollen', () => {
    const schema = createInputSchema('2026-11-19');
    for (const tag of ['2027-02-30', '2026-04-31', '2026-13-01']) {
      expect(
        schema.safeParse({ art: 'termin', titel: 'OV-Treffen', termine: [{ tag }] }).success
      ).toBe(false);
    }
    expect(
      schema.safeParse({ art: 'termin', titel: 'OV-Treffen', termine: [{ tag: '2028-02-29' }] })
        .success
    ).toBe(true);
  });
});

describe('editInputSchema', () => {
  const schema = editInputSchema('2026-11-19');

  it('verlangt mindestens eine Änderung', () => {
    expect(schema.safeParse({ umfrage: 'OV-Treffen' }).success).toBe(false);
    expect(schema.safeParse({ umfrage: 'OV-Treffen', titel: 'Neu' }).success).toBe(true);
  });

  it('lehnt neue Termine in der Vergangenheit und einen Ablauf bis heute ab', () => {
    expect(
      schema.safeParse({ umfrage: 'OV', termine_hinzufuegen: [{ tag: '2026-11-03' }] }).success
    ).toBe(false);
    expect(schema.safeParse({ umfrage: 'OV', ende: '2026-11-19' }).success).toBe(false);
    // Entfernen darf auch einen vergangenen Termin.
    expect(
      schema.safeParse({ umfrage: 'OV', termine_entfernen: [{ tag: '2026-11-03' }] }).success
    ).toBe(true);
  });
});

describe('toEdit', () => {
  it('macht je Uhrzeit einen Termin und ohne Uhrzeit den ganztägigen', () => {
    expect(
      toEdit({
        umfrage: 'OV',
        beschreibung: '',
        termine_hinzufuegen: [
          { tag: '2026-12-10', uhrzeiten: ['18:00', '20:00'] },
          { tag: '2026-12-11' },
        ],
        termine_entfernen: [{ tag: '2026-12-01', uhrzeit: '19:00' }, { tag: '2026-12-02' }],
      })
    ).toEqual({
      description: '',
      addSlots: [
        { day: '2026-12-10', time: '18:00' },
        { day: '2026-12-10', time: '20:00' },
        { day: '2026-12-11', time: '' },
      ],
      removeSlots: [
        { day: '2026-12-01', time: '19:00' },
        { day: '2026-12-02', time: '' },
      ],
    });
  });
});
