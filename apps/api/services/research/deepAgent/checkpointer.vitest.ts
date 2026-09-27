import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn<(sql: string) => Promise<unknown>>();
const setup = vi.fn<() => Promise<void>>();
const constructed: unknown[] = [];
let pool: unknown = null;

vi.mock('../../../database/services/PostgresService/index.js', () => ({
  getPostgresInstance: () => ({ pool }),
}));
vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: class {
    constructor(...args: unknown[]) {
      constructed.push(args);
    }
    setup = setup;
  },
}));

const { CHECKPOINT_SCHEMA, getCheckpointer, resetCheckpointerForTests } =
  await import('./checkpointer.js');

beforeEach(() => {
  vi.clearAllMocks();
  constructed.length = 0;
  resetCheckpointerForTests();
  pool = { query };
  query.mockResolvedValue({});
  setup.mockResolvedValue();
});

afterEach(() => {
  resetCheckpointerForTests();
});

describe('getCheckpointer', () => {
  it('creates its own schema before letting the saver build its tables', async () => {
    await getCheckpointer();

    // Four generic table names (`checkpoints`, `checkpoint_blobs`, …) that the
    // saver owns and migrates. `PostgresService.init()` must never meet them
    // among ours in `public`.
    expect(query).toHaveBeenCalledWith(expect.stringContaining(CHECKPOINT_SCHEMA));
    expect(constructed[0]).toEqual([pool, undefined, { schema: CHECKPOINT_SCHEMA }]);
    expect(setup).toHaveBeenCalledTimes(1);
  });

  /**
   * `setup()` is DDL. Running it per research would put a schema migration in
   * front of every run; the cache is what keeps it to once per process, and it
   * has to hold for concurrent callers too, not just sequential ones.
   */
  it('sets up once per process, even under concurrent runs', async () => {
    const [a, b] = await Promise.all([getCheckpointer(), getCheckpointer()]);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  /**
   * Fail open, in both directions. A research run that is merely non-resumable
   * is the run we had before; a research run that dies because a table could
   * not be created is a regression.
   */
  it('returns null instead of throwing when Postgres is unreachable', async () => {
    pool = null;

    expect(await getCheckpointer()).toBeNull();
  });

  it('returns null instead of throwing when setup fails', async () => {
    setup.mockRejectedValue(new Error('permission denied for database'));

    expect(await getCheckpointer()).toBeNull();
  });

  it('does not retry a failed setup on every run', async () => {
    setup.mockRejectedValue(new Error('permission denied'));

    await getCheckpointer();
    await getCheckpointer();

    // A run every few minutes hammering DDL that is not allowed is noise in the
    // log and load on the database, and it will not start working by itself.
    expect(setup).toHaveBeenCalledTimes(1);
  });
});
