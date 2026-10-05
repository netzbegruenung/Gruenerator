import { describe, expect, it, vi } from 'vitest';

import {
  apply,
  findRepairs,
  parseCliArgs,
  repairMojibake,
  type Db,
  type Repair,
} from './repair-mojibake-filenames.js';

/** So hat multer den Namen vor #4137 gelesen. */
const asMulterRead = (name: string): string => Buffer.from(name, 'utf8').toString('latin1');

describe('repairMojibake', () => {
  it('repariert, was multer als latin1 gelesen hat', () => {
    for (const name of [
      'WP-04_Ein_Land_der_Solidarität.pdf',
      'Protokoll_März_Größe_Übersicht.docx',
      'Straße €uro – „Zitat“.pdf',
      'Emoji 🌻.png',
    ]) {
      expect(repairMojibake(asMulterRead(name))).toBe(name);
    }
  });

  it('lässt richtige Namen stehen', () => {
    for (const name of [
      'Müller.pdf',
      'Solidarität.pdf',
      'plain-ascii.pdf',
      '',
      'Größe Ä Ö Ü ß',
      'Café ©2026',
      'Straße €uro.pdf',
    ]) {
      expect(repairMojibake(name)).toBeNull();
    }
  });

  it('repariert nicht doppelt', () => {
    const once = repairMojibake(asMulterRead('Solidarität.pdf'));
    expect(once && repairMojibake(once)).toBeNull();
  });
});

describe('parseCliArgs', () => {
  it('ist ohne Argumente ein Trockenlauf und verlangt für Schreiben eine Plandatei', () => {
    expect(parseCliArgs([])).toEqual({ mode: 'dry-run', planFile: null });
    expect(parseCliArgs(['--write', 'plan.json'])).toEqual({
      mode: 'write',
      planFile: 'plan.json',
    });
    expect(parseCliArgs(['--undo', 'plan.json'])).toEqual({ mode: 'undo', planFile: 'plan.json' });
    expect(parseCliArgs(['--write'])).toHaveProperty('error');
    expect(parseCliArgs(['--force'])).toHaveProperty('error');
  });
});

describe('findRepairs', () => {
  it('nimmt nur die Spalten, die wirklich Mojibake tragen', async () => {
    const broken = asMulterRead('Solidarität.pdf');
    const db: Db = {
      query: async <T>(sql: string) =>
        (sql.includes('FROM documents')
          ? [{ id: 'd1', user_id: 'u1', title: 'Müller', filename: broken }]
          : []) as T[],
    };
    expect(await findRepairs(db)).toEqual([
      {
        table: 'documents',
        id: 'd1',
        column: 'filename',
        from: broken,
        to: 'Solidarität.pdf',
        userId: 'u1',
      },
    ]);
  });
});

describe('apply', () => {
  const doc: Repair = {
    table: 'documents',
    id: 'd1',
    column: 'title',
    from: 'SolidaritÃ¤t',
    to: 'Solidarität',
    userId: 'u1',
  };
  const attachment: Repair = { ...doc, table: 'board_attachments', column: 'file_name', id: 'b1' };

  it('schreibt nur, wo noch der erwartete Wert steht, und setzt Qdrant nur für Dokumente', async () => {
    const calls: unknown[][] = [];
    const db: Db = {
      query: async <T>(_sql: string, params?: unknown[]) => {
        calls.push(params ?? []);
        return (params?.[1] === 'b1' ? [] : [{ id: params?.[1] }]) as T[];
      },
    };
    const setPayload = vi.fn(async () => {});

    expect(await apply(db, [doc, attachment], 'forward', setPayload)).toEqual({
      written: 1,
      failed: 0,
    });
    expect(calls).toEqual([
      ['Solidarität', 'd1', 'SolidaritÃ¤t'],
      ['Solidarität', 'b1', 'SolidaritÃ¤t'],
    ]);
    expect(setPayload).toHaveBeenCalledExactlyOnceWith('u1', 'd1', { title: 'Solidarität' });
  });

  it('dreht beim Zurückdrehen beide Werte um', async () => {
    const calls: unknown[][] = [];
    const db: Db = {
      query: async <T>(_sql: string, params?: unknown[]) => {
        calls.push(params ?? []);
        return [{ id: 'd1' }] as T[];
      },
    };
    const setPayload = vi.fn(async () => {});

    await apply(db, [doc], 'back', setPayload);
    expect(calls).toEqual([['SolidaritÃ¤t', 'd1', 'Solidarität']]);
    expect(setPayload).toHaveBeenCalledWith('u1', 'd1', { title: 'SolidaritÃ¤t' });
  });

  it('dreht die Zeile zurück, wenn Qdrant scheitert, damit ein zweiter Lauf sie findet', async () => {
    const calls: unknown[][] = [];
    const db: Db = {
      query: async <T>(_sql: string, params?: unknown[]) => {
        calls.push(params ?? []);
        return [{ id: 'd1' }] as T[];
      },
    };
    const setPayload = vi.fn(async () => {
      throw new Error('qdrant down');
    });

    expect(await apply(db, [doc], 'forward', setPayload)).toEqual({ written: 0, failed: 1 });
    expect(calls).toEqual([
      ['Solidarität', 'd1', 'SolidaritÃ¤t'],
      ['SolidaritÃ¤t', 'd1', 'Solidarität'],
    ]);
  });
});
