/**
 * Saved Abrechnungen: owner scoping, slug-or-id lookup, and the trust boundary.
 *
 * Drizzle is faked at the builder level; the WHERE clause is rendered through
 * the real PgDialect, so the assertions read the SQL and params Postgres would
 * get — "scoped by user_id and not trashed" is checked on the statement, not
 * on a mock's call arguments.
 */
import { type ReisekostenServerState } from '@gruenerator/contracts';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Recorded {
  kind: 'select' | 'insert' | 'update';
  where?: { sql: string; params: unknown[] };
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
}

const dialect = new PgDialect();
const recorded: Recorded[] = [];
let nextResult: unknown[] = [];

function builder(kind: Recorded['kind']) {
  const entry: Recorded = { kind };
  recorded.push(entry);
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'orderBy', 'limit', 'returning']) chain[m] = () => chain;
  chain.where = (w: SQL) => {
    entry.where = dialect.sqlToQuery(w);
    return chain;
  };
  chain.values = (v: Record<string, unknown>) => {
    entry.values = v;
    return chain;
  };
  chain.set = (v: Record<string, unknown>) => {
    entry.set = v;
    return chain;
  };
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult).then(resolve);
  return chain;
}

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => builder('select'),
    insert: () => builder('insert'),
    update: () => builder('update'),
  }),
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));

const {
  buildAbrechnungSlug,
  createAbrechnung,
  getAbrechnung,
  listAbrechnungen,
  toAbrechnung,
  trashAbrechnung,
  updateAbrechnung,
} = await import('./abrechnungService.js');

const USER = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';

const STATE: ReisekostenServerState = {
  rateKey: 'de-DE/nrw',
  stammdaten: { name: 'Alex Muster', email: 'alex@example.org' },
  reise: {
    anlass: 'Landesparteitag Köln',
    ziel: 'Köln',
    reisebeginn: '2026-10-01T08:00',
    rueckkehr: '2026-10-01T20:00',
  },
  fahrt: { bahn: null, oepnv: null, kfz: null, miete: null, taxi: null, sonstiges: null },
  verpflegungAbzuege: [],
  uebernachtung: null,
  spende: 0,
};

const ROW = {
  id: ID,
  user_id: USER,
  slug_suffix: 'Ab3xK9',
  titel: 'Landesparteitag Köln',
  status: 'entwurf',
  state: STATE,
  belege: [],
  created_at: new Date('2026-10-01T10:00:00Z'),
  updated_at: new Date('2026-10-02T10:00:00Z'),
  deleted_at: null,
};

beforeEach(() => {
  recorded.length = 0;
  nextResult = [];
});

function expectOwnerScoped(where: Recorded['where']) {
  expect(where?.sql).toContain('"user_id" = $');
  expect(where?.sql).toContain('"deleted_at" is null');
  expect(where?.params).toContain(USER);
}

describe('createAbrechnung', () => {
  it('drops bank details, address and phone even when the caller passes them', async () => {
    nextResult = [ROW];
    const leaky = {
      ...STATE,
      stammdaten: {
        ...STATE.stammdaten,
        iban: 'DE89370400440532013000',
        bic: 'COBADEFFXXX',
        strasse: 'Hauptstr.',
        telefon: '0123',
      },
    } as ReisekostenServerState;

    await createAbrechnung(USER, leaky);

    const insert = recorded.find((r) => r.kind === 'insert');
    const stored = insert?.values?.state as ReisekostenServerState;
    expect(stored.stammdaten).toEqual({ name: 'Alex Muster', email: 'alex@example.org' });
    expect(JSON.stringify(insert?.values)).not.toContain('DE89');
  });

  it('owns the row, takes the titel from the Anlass and generates a suffix', async () => {
    nextResult = [ROW];
    await createAbrechnung(USER, STATE);

    const values = recorded.find((r) => r.kind === 'insert')?.values;
    expect(values?.user_id).toBe(USER);
    expect(values?.titel).toBe('Landesparteitag Köln');
    expect(values?.slug_suffix).toMatch(/^[A-Za-z0-9]{6}$/);
  });
});

describe('getAbrechnung', () => {
  it('resolves a slug by its suffix, scoped to the owner and live rows', async () => {
    nextResult = [ROW];
    const row = await getAbrechnung(USER, 'landesparteitag-koeln-Ab3xK9');

    expect(row).toBe(ROW);
    const where = recorded[0]?.where;
    expectOwnerScoped(where);
    expect(where?.params).toContain('Ab3xK9');
  });

  it('still resolves a raw uuid', async () => {
    nextResult = [ROW];
    await getAbrechnung(USER, ID);
    expect(recorded[0]?.where?.sql).toContain('"id" = $');
    expect(recorded[0]?.where?.params).toContain(ID);
  });

  it("answers null for someone else's row (the owner filter finds nothing)", async () => {
    nextResult = [];
    expect(await getAbrechnung(USER, ID)).toBeNull();
    expectOwnerScoped(recorded[0]?.where);
  });

  it('does not query for something that is neither uuid nor slug', async () => {
    expect(await getAbrechnung(USER, 'garbage')).toBeNull();
    expect(recorded).toHaveLength(0);
  });
});

describe('listAbrechnungen', () => {
  it('lists only the owner’s live rows', async () => {
    nextResult = [ROW];
    expect(await listAbrechnungen(USER)).toEqual([ROW]);
    expectOwnerScoped(recorded[0]?.where);
  });
});

describe('updateAbrechnung', () => {
  it('lets the titel follow the Anlass, keeps the remarks and strips the IBAN again', async () => {
    nextResult = [ROW];
    const state = {
      ...STATE,
      anmerkungen: 'Abfahrt vom Arbeitsort',
      reise: { ...STATE.reise, anlass: '  Kreisvorstand  ' },
      stammdaten: { ...STATE.stammdaten, iban: 'DE89370400440532013000' },
    } as ReisekostenServerState;

    await updateAbrechnung(USER, ID, { state, status: 'eingereicht' });

    const update = recorded[0]!;
    expect(update.set?.titel).toBe('Kreisvorstand');
    expect(update.set?.status).toBe('eingereicht');
    expect(update.set?.updated_at).toBeInstanceOf(Date);
    expect(JSON.stringify(update.set?.state)).not.toContain('iban');
    expect(update.set?.state).toMatchObject({ anmerkungen: 'Abfahrt vom Arbeitsort' });
    expectOwnerScoped(update.where);
  });

  it('leaves state and titel alone on a belege-only patch', async () => {
    nextResult = [ROW];
    await updateAbrechnung(USER, ID, { belege: [] });
    expect(recorded[0]?.set).not.toHaveProperty('state');
    expect(recorded[0]?.set).not.toHaveProperty('titel');
    expect(recorded[0]?.set?.belege).toEqual([]);
  });

  it('answers null when no own live row matched', async () => {
    nextResult = [];
    expect(await updateAbrechnung(USER, ID, { status: 'entwurf' })).toBeNull();
  });
});

describe('trashAbrechnung', () => {
  it('sets deleted_at on the owner’s live row only', async () => {
    nextResult = [{ id: ID }];
    expect(await trashAbrechnung(USER, ID)).toBe(true);
    expect(recorded[0]?.set?.deleted_at).toBeInstanceOf(Date);
    expectOwnerScoped(recorded[0]?.where);
  });

  it('reports false for a foreign or missing row', async () => {
    nextResult = [];
    expect(await trashAbrechnung(USER, ID)).toBe(false);
  });
});

describe('toAbrechnung', () => {
  it('builds the Notion-style slug and ISO timestamps', () => {
    const a = toAbrechnung(ROW);
    expect(a.slug).toBe('landesparteitag-koeln-Ab3xK9');
    expect(a.updatedAt).toBe('2026-10-02T10:00:00.000Z');
    expect(buildAbrechnungSlug('', 'Ab3xK9')).toBe('reisekosten-Ab3xK9');
  });
});
