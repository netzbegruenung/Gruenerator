/**
 * Die Kategorie eines eigenen Rezepts (`skill_category`): das Upsert schreibt
 * sie, lässt sie bei einem Client stehen, der sie nicht mitschickt (F0 — die
 * ausgelieferten Editoren kennen das Feld nicht), und `null` leert sie. Gelesen
 * wird sie von der Liste wie von der Mention-Abfrage.
 */
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let insertedValues: Record<string, unknown> = {};
let conflictSet: Record<string, unknown> = {};
let upsertRows: unknown[] = [];
let rawRows: unknown[] = [];

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValues = values;
        return {
          onConflictDoUpdate: (config: { set: Record<string, unknown> }) => {
            conflictSet = config.set;
            return { returning: async () => upsertRows };
          },
        };
      },
    }),
  }),
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: async () => rawRows }),
}));

const { listMentionableTextForms, upsertTextForm } = await import('./textFormRepository.js');

const input = {
  kind: 'custom' as const,
  mention: 'ov-post',
  title: 'OV-Post',
  examples: [],
  styleBlock: 'Kurz.',
};

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    user_id: 'u1',
    kind: 'custom',
    text_type: null,
    mention: 'ov-post',
    title: 'OV-Post',
    examples: [],
    style_block: 'Kurz.',
    model: null,
    analyzed_at: new Date('2026-11-10T00:00:00Z'),
    updated_at: new Date('2026-11-10T00:00:00Z'),
    description: null,
    icon_key: null,
    skill_category: null,
    share_mode: 'private',
    is_public: false,
    public_ownership: null,
    ...over,
  };
}

const sqlOf = (fragment: unknown): string => new PgDialect().sqlToQuery(fragment as SQL).sql;

beforeEach(() => {
  insertedValues = {};
  conflictSet = {};
  upsertRows = [row()];
  rawRows = [];
});

describe('upsertTextForm: category', () => {
  it('writes the category on insert and update', async () => {
    upsertRows = [row({ skill_category: 'social' })];
    const form = await upsertTextForm('u1', { ...input, category: 'social' });

    expect(insertedValues.skill_category).toBe('social');
    expect(conflictSet.skill_category).toBe('social');
    expect(form.category).toBe('social');
  });

  it('keeps the stored category when the client sends none', async () => {
    await upsertTextForm('u1', { ...input });

    expect(sqlOf(conflictSet.skill_category)).toContain('skill_category');
  });

  it('clears the category on an explicit null', async () => {
    await upsertTextForm('u1', { ...input, category: null });

    expect(conflictSet.skill_category).toBeNull();
  });
});

describe('listMentionableTextForms: category', () => {
  it('carries the category of an own recipe', async () => {
    rawRows = [
      {
        id: 'f1',
        user_id: 'u1',
        created_at: new Date(),
        mention: 'ov-post',
        title: 'OV-Post',
        description: null,
        icon_key: null,
        skill_category: 'social',
        kind: 'custom',
        is_public: false,
        access_rank: 0,
        group_name: null,
        owner_name: null,
      },
    ];
    const forms = await listMentionableTextForms('u1', 200, { includePublic: false });

    expect(forms.map((f) => f.category)).toEqual(['social']);
  });
});
