/**
 * Rezepte im Papierkorb: löschen setzt nur `deleted_at`, jeder Leser blendet
 * die Zeile aus, und weil `(user_id, mention)` auch für getrashte Zeilen
 * belegt bleibt, darf ein Speichern unter derselben Mention die Zeile im
 * Papierkorb nicht still überschreiben.
 */
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rawSql: string[] = [];
const rawParams: unknown[][] = [];
let rawRows: unknown[] = [];
const whereCalls: unknown[] = [];
const updateSet = vi.fn();
const onConflict = vi.fn();
let upsertRows: unknown[] = [];

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          whereCalls.push(condition);
          return Object.assign(Promise.resolve([]), { limit: async () => [] });
        },
      }),
    }),
    update: () => ({
      set: (values: unknown) => {
        updateSet(values);
        return {
          where: (condition: unknown) => {
            whereCalls.push(condition);
            return { returning: async () => [{ id: 'f1' }] };
          },
        };
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: (config: unknown) => {
          onConflict(config);
          return { returning: async () => upsertRows };
        },
      }),
    }),
    delete: () => {
      throw new Error('a delete must not hard-delete — it moves to the Papierkorb');
    },
  }),
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      rawSql.push(sql);
      rawParams.push(params);
      return rawRows;
    },
  }),
}));

const { deleteTextForm, listMentionableTextForms, listTextForms, purgeTextForm, upsertTextForm } =
  await import('./textFormRepository.js');

const ID = '11111111-1111-4111-8111-111111111111';
const whereSql = (i: number): string => new PgDialect().sqlToQuery(whereCalls[i] as SQL).sql;

beforeEach(() => {
  rawSql.length = 0;
  rawParams.length = 0;
  rawRows = [];
  whereCalls.length = 0;
  updateSet.mockClear();
  onConflict.mockClear();
  upsertRows = [];
});

describe('Rezept Papierkorb', () => {
  it('delete only sets deleted_at on the live own recipe', async () => {
    await expect(deleteTextForm('u1', 'pressemitteilung-kv')).resolves.toBe(true);
    expect(updateSet).toHaveBeenCalledWith({ deleted_at: expect.any(Date) });
    expect(whereSql(0)).toContain('"deleted_at" is null');
  });

  it('own, shared and mentionable readers hide trashed recipes', async () => {
    await listTextForms('u1');
    expect(whereSql(0)).toContain('"deleted_at" is null');
    await listMentionableTextForms('u1');
    for (const sql of rawSql.filter((s) => s.includes('FROM user_text_forms tf'))) {
      expect(sql).toContain('tf.deleted_at IS NULL');
    }
  });

  it('a save under the mention of a trashed recipe refuses instead of overwriting it', async () => {
    upsertRows = [];
    await expect(
      upsertTextForm('u1', {
        kind: 'custom',
        mention: 'pressemitteilung-kv',
        title: 'PM',
        examples: [],
        styleBlock: '',
      })
    ).rejects.toThrow(/Papierkorb/);
    const config = onConflict.mock.calls[0]?.[0] as { setWhere: SQL };
    expect(new PgDialect().sqlToQuery(config.setWhere).sql).toContain('"deleted_at" is null');
  });

  it('purge deletes only a trashed row, conditionally on the cutoff', async () => {
    rawRows = [{ id: ID }];
    const cutoff = new Date('2026-08-30T00:00:00Z');
    await expect(purgeTextForm(ID, cutoff)).resolves.toBe(true);
    expect(rawSql[0]).toContain('DELETE FROM user_text_forms');
    expect(rawSql[0]).toContain('deleted_at IS NOT NULL');
    expect(rawParams[0]).toEqual([ID, cutoff]);

    rawRows = [];
    await expect(purgeTextForm(ID, null)).resolves.toBe(false);
  });
});
