/**
 * Die Sichtbarkeits-Invarianten eines Notebooks — an EINER Stelle, geprüft
 * gegen einen Fake-Helper. Router-Handler und die Bestätigungskarte des Chats
 * rufen dieselbe Funktion; was hier steht, gilt für beide Türen.
 */
import { describe, expect, it, vi } from 'vitest';

import { applyNotebookVisibility, planNotebookVisibility } from './notebookVisibility.js';

import type { NotebookCollection } from '../../database/services/NotebookQdrantHelper.js';

function collection(over: Partial<NotebookCollection> = {}): NotebookCollection {
  return {
    id: 'n1',
    user_id: 'u1',
    name: 'Kreisverband',
    share_mode: 'private',
    edit_policy: 'owner_only',
    is_public: false,
    public_ownership: null,
    ...over,
  } as NotebookCollection;
}

describe('planNotebookVisibility', () => {
  it('stepping share_mode down clears the public listing', () => {
    const plan = planNotebookVisibility(
      collection({ share_mode: 'authenticated', is_public: true, public_ownership: 'owner' }),
      { share_mode: 'groups' }
    );
    expect(plan).toEqual({
      ok: true,
      updates: { share_mode: 'groups', is_public: false, public_ownership: null },
    });
  });

  it('keeps the listing when the mode stays authenticated', () => {
    const plan = planNotebookVisibility(
      collection({ share_mode: 'authenticated', is_public: true, public_ownership: 'owner' }),
      { share_mode: 'authenticated', edit_policy: 'all_members' }
    );
    expect(plan).toEqual({
      ok: true,
      updates: { share_mode: 'authenticated', edit_policy: 'all_members' },
    });
  });

  it('refuses a public listing without the ownership statement', () => {
    const plan = planNotebookVisibility(collection({ share_mode: 'authenticated' }), {
      is_public: true,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toContain('Quelle der Inhalte');
  });

  it('refuses a public listing unless share_mode is (or becomes) authenticated', () => {
    const stays = planNotebookVisibility(collection(), {
      is_public: true,
      public_ownership: 'owner',
    });
    expect(stays.ok).toBe(false);
    if (!stays.ok) expect(stays.error).toContain('Mit Anmeldung');

    // Beides in EINEM Aufruf ist der Weg der Karte: erst die Stufe, dann die Listung.
    const becomes = planNotebookVisibility(collection(), {
      share_mode: 'authenticated',
      is_public: true,
      public_ownership: 'owner',
    });
    expect(becomes).toEqual({
      ok: true,
      updates: { share_mode: 'authenticated', is_public: true, public_ownership: 'owner' },
    });
  });

  it('unlisting drops the ownership statement with it', () => {
    const plan = planNotebookVisibility(
      collection({ share_mode: 'authenticated', is_public: true, public_ownership: 'owner' }),
      { is_public: false }
    );
    expect(plan).toEqual({ ok: true, updates: { is_public: false, public_ownership: null } });
  });

  it('an empty patch is a no-op, not an error', () => {
    expect(planNotebookVisibility(collection(), {})).toEqual({ ok: true, updates: {} });
  });
});

describe('applyNotebookVisibility', () => {
  const helperWith = (row: NotebookCollection | null) => ({
    getNotebookCollection: vi.fn(async () => row),
    updateNotebookCollection: vi.fn(async () => ({ success: true })),
  });

  it('writes the planned updates for the owner', async () => {
    const helper = helperWith(collection({ share_mode: 'authenticated' }));
    const out = await applyNotebookVisibility('n1', 'u1', { edit_policy: 'group_admins' }, helper);
    expect(out).toEqual({ ok: true });
    expect(helper.updateNotebookCollection).toHaveBeenCalledWith('n1', {
      edit_policy: 'group_admins',
    });
  });

  it('is owner-only', async () => {
    const helper = helperWith(collection({ user_id: 'other' }));
    const out = await applyNotebookVisibility('n1', 'u1', { share_mode: 'groups' }, helper);
    expect(out).toEqual({ ok: false, status: 403, error: 'Nur Eigentümer*in erlaubt' });
    expect(helper.updateNotebookCollection).not.toHaveBeenCalled();
  });

  it('reports a missing notebook as 404', async () => {
    const out = await applyNotebookVisibility('n1', 'u1', {}, helperWith(null));
    expect(out).toEqual({ ok: false, status: 404, error: 'Notebook nicht gefunden' });
  });

  it('surfaces an invariant violation as 400 without writing', async () => {
    const helper = helperWith(collection());
    const out = await applyNotebookVisibility('n1', 'u1', { is_public: true }, helper);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
    expect(helper.updateNotebookCollection).not.toHaveBeenCalled();
  });
});
