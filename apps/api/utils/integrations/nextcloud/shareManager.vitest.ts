/**
 * #3037: die Share-Links liegen als JSONB-Array in einer Profilspalte, jede
 * Änderung ist ein Lesen-Ändern-Schreiben über das ganze Array.
 *
 * Was diese Attrappe zeigen kann und was nicht: dass Lesen und Schreiben in
 * DERSELBEN Transaktion liegen und das SELECT `FOR UPDATE` trägt, ist hier
 * prüfbar. Ob Postgres daraufhin wirklich serialisiert, ist Postgres' Sache
 * und keine Zusicherung, die ein Fake herstellen könnte — die Tests behaupten
 * es deshalb auch nicht.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { PoolClient } from 'pg';

const state: { links: unknown[]; sql: string[] } = { links: [], sql: [] };

const fakePostgres = {
  ensureInitialized: async () => {},
  transaction: async <T>(cb: (client: PoolClient) => Promise<T>): Promise<T> =>
    cb({} as PoolClient),
  transactionQueryOne: async (_client: PoolClient, sql: string) => {
    state.sql.push(sql);
    return { nextcloud_share_links: state.links };
  },
  transactionExec: async (_client: PoolClient, sql: string, params: unknown[]) => {
    state.sql.push(sql);
    state.links = JSON.parse(params[0] as string) as unknown[];
    return { changes: 1 };
  },
  exec: async () => ({ changes: 0 }),
};

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => fakePostgres,
}));

const { NextcloudShareManager } = await import('./shareManager.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  state.links = [];
  state.sql = [];
});

describe('saveShareLink', () => {
  it('reads and writes inside one transaction, and locks the row it read', async () => {
    await NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/Tok123', 'Anträge');

    // Ohne `FOR UPDATE` liest die zweite gleichzeitige Anfrage den alten Stand
    // und überschreibt danach den ersten Schreibvorgang.
    expect(state.sql[0]).toContain('FOR UPDATE');
    expect(state.sql[1]).toContain('UPDATE profiles');
  });

  it('gives a new link a UUID, not a timestamp', async () => {
    const link = await NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/Tok123');
    expect(link.id).toMatch(UUID_RE);
  });

  it('rejects a duplicate inside the lock, not before it', async () => {
    await NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/Tok123');
    state.sql = [];

    await expect(
      NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/Tok123')
    ).rejects.toThrow('already saved');

    // Die Prüfung sah den gesperrten Stand — vor der Sperre gelesen wäre sie
    // genau das Rennen, gegen das sie antritt.
    expect(state.sql[0]).toContain('FOR UPDATE');
    expect(state.links).toHaveLength(1);
  });

  it('keeps both links when two are added one after the other', async () => {
    await NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/AAA111');
    await NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/BBB222');
    expect(state.links).toHaveLength(2);
  });
});

describe('updateShareLink', () => {
  it('changes one link and leaves the other alone', async () => {
    const a = await NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/AAA111');
    await NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/BBB222');

    const updated = await NextcloudShareManager.updateShareLink('user-1', a.id, {
      label: 'Umbenannt',
    });

    expect(updated.label).toBe('Umbenannt');
    expect(state.links).toHaveLength(2);
  });

  it('refuses an id that is not in the list', async () => {
    await expect(
      NextcloudShareManager.updateShareLink('user-1', 'nope', { label: 'x' })
    ).rejects.toThrow('not found');
  });
});

describe('deleteShareLink', () => {
  it('removes exactly the named link', async () => {
    const a = await NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/AAA111');
    const b = await NextcloudShareManager.saveShareLink('user-1', 'https://w.example/s/BBB222');

    await NextcloudShareManager.deleteShareLink('user-1', a.id);

    expect((state.links as { id: string }[]).map((l) => l.id)).toEqual([b.id]);
  });

  it('still resolves a legacy timestamp id', async () => {
    // Bestandsdaten tragen `Date.now().toString()`. Die Spalten sind TEXT und
    // jeder Vergleich ist ein Stringvergleich — der Wechsel auf UUIDs ist
    // deshalb additiv und braucht keine Migration.
    state.links = [{ id: '1756382400000', share_link: 'https://w.example/s/Old999' }];

    await NextcloudShareManager.deleteShareLink('user-1', '1756382400000');
    expect(state.links).toEqual([]);
  });
});
