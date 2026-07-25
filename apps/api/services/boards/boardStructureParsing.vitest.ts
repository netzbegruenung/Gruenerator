/**
 * parseBoardStructure used to be a bare JSON.parse with no field checks, so a
 * model that omitted `statusOptions` returned an object that crashed with a
 * TypeError deep inside postProcessBoardStructure (`structure.statusOptions.map`)
 * rather than reporting "no parseable structure". The caller then treated a
 * crash as a generation failure and fell through to the generic responder.
 *
 * These pin the validation of exactly the fields post-processing dereferences.
 */

import { describe, expect, it, vi } from 'vitest';

// Board writes go through Postgres; the parser is pure, so stub the module the
// service pulls in at import time.
vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({}),
}));

const { parseBoardStructure, postProcessBoardStructure } = await import('./BoardService.js');

const valid = {
  title: 'Kampagnenplan',
  statusOptions: [
    { id: 'status-1', name: 'Offen' },
    { id: 'status-2', name: 'Erledigt' },
  ],
  rows: [{ id: 'row-1', title: 'Flyer entwerfen', status: 'status-1', description: '' }],
};

describe('parseBoardStructure', () => {
  it('parses a well-formed structure', () => {
    const result = parseBoardStructure(JSON.stringify(valid));

    expect(result).not.toBeNull();
    expect(result?.title).toBe('Kampagnenplan');
    expect(result?.statusOptions).toHaveLength(2);
    expect(result?.rows).toHaveLength(1);
  });

  it('extracts JSON embedded in surrounding prose', () => {
    const result = parseBoardStructure(`Hier ist das Board:\n${JSON.stringify(valid)}\nFertig.`);

    expect(result?.title).toBe('Kampagnenplan');
  });

  it('rejects a structure without statusOptions instead of crashing later', () => {
    const { statusOptions: _omitted, ...withoutStatus } = valid;

    expect(parseBoardStructure(JSON.stringify(withoutStatus))).toBeNull();
  });

  it('rejects empty statusOptions', () => {
    expect(parseBoardStructure(JSON.stringify({ ...valid, statusOptions: [] }))).toBeNull();
  });

  it('rejects malformed statusOptions entries', () => {
    expect(
      parseBoardStructure(JSON.stringify({ ...valid, statusOptions: [{ name: 'Ohne id' }] }))
    ).toBeNull();
  });

  it('rejects a structure without rows', () => {
    const { rows: _omitted, ...withoutRows } = valid;

    expect(parseBoardStructure(JSON.stringify(withoutRows))).toBeNull();
  });

  it('rejects non-JSON', () => {
    expect(parseBoardStructure('Ich habe leider kein Board erstellt.')).toBeNull();
  });

  it('drops malformed rows but keeps the board', () => {
    const result = parseBoardStructure(
      JSON.stringify({ ...valid, rows: [...valid.rows, { description: 'kein id/title' }] })
    );

    expect(result?.rows).toHaveLength(1);
  });

  it('defaults a missing title rather than failing', () => {
    const { title: _omitted, ...withoutTitle } = valid;

    expect(parseBoardStructure(JSON.stringify(withoutTitle))?.title).toBe('Neues Board');
  });

  it('produces a structure post-processing can consume without throwing', () => {
    const parsed = parseBoardStructure(JSON.stringify(valid));

    expect(() => postProcessBoardStructure(parsed!, 'user-1')).not.toThrow();
  });
});
