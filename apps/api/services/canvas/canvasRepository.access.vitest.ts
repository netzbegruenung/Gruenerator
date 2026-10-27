/**
 * Opening a sharepic from a "Mit Anmeldung" link enrolls the visitor as a
 * collaborator — the same way opening a document does — but only on the
 * studio's open read, never on the internal access checks through getCanvas.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, checkDocumentAccess, autoGrantSharePermission, canWriteDocument } = vi.hoisted(
  () => ({
    query: vi.fn(),
    checkDocumentAccess: vi.fn(),
    autoGrantSharePermission: vi.fn(),
    canWriteDocument: vi.fn(),
  })
);

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../routes/docs/documentAccess.js', () => ({
  checkDocumentAccess,
  autoGrantSharePermission,
  canWriteDocument,
}));

const { getCanvas, checkCanvasWriteAccess, createCanvas } = await import('./canvasRepository.js');

const row = {
  id: 'canvas-1',
  title: 'Busse statt Stau',
  created_by: 'owner-1',
  created_at: new Date('2026-10-01T00:00:00Z'),
  updated_at: new Date('2026-10-01T00:00:00Z'),
  permissions: {},
  is_public: false,
  share_mode: 'authenticated',
  share_permission: 'viewer',
  template_type: 'freeform',
  base_template_id: null,
  thumbnail_url: null,
  page_count: 1,
  initial_state: {},
  format: 'post-portrait',
  creator_name: 'Owner',
};

const grant = {
  level: 'viewer',
  granted_at: '2026-10-16T00:00:00Z',
  granted_by: 'auto:share_link',
};

/** The canvas read returns `canvasRow`; the Vorlage-snapshot probe hits iff `snapshot`. */
function primeDb(canvasRow: Record<string, unknown> = row, snapshot = false) {
  query.mockReset().mockImplementation(async (sql: string) => {
    if (/FROM user_templates/i.test(sql)) return snapshot ? [{ '?column?': 1 }] : [];
    return [canvasRow];
  });
}

const snapshotProbes = () =>
  query.mock.calls.filter(([sql]) => /FROM user_templates/i.test(sql as string)).length;

beforeEach(() => {
  primeDb();
  checkDocumentAccess.mockReset().mockResolvedValue({ hasAccess: true });
  autoGrantSharePermission.mockReset().mockReturnValue(grant);
  canWriteDocument.mockReset().mockResolvedValue(false);
});

describe('getCanvas joinViaLink', () => {
  it('enrolls the visitor with the link permission when opened from the studio', async () => {
    const res = await getCanvas('canvas-1', 'visitor-2', { joinViaLink: true });
    expect(res.kind).toBe('ok');
    expect(autoGrantSharePermission).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'canvas-1',
        created_by: 'owner-1',
        share_mode: 'authenticated',
        share_permission: 'viewer',
      }),
      'visitor-2'
    );
  });

  it('returns the canvas with the new entry, so an editor link is editable at once', async () => {
    const res = await getCanvas('canvas-1', 'visitor-2', { joinViaLink: true });
    expect(res.kind === 'ok' && res.canvas.permissions?.['visitor-2']).toEqual(grant);
  });

  it("never enrolls into a Vorlage's snapshot", async () => {
    primeDb(row, true);
    const res = await getCanvas('canvas-1', 'visitor-2', { joinViaLink: true });
    expect(res.kind).toBe('ok');
    expect(autoGrantSharePermission).not.toHaveBeenCalled();
  });

  it('skips the snapshot probe when nobody would be enrolled', async () => {
    await getCanvas('canvas-1', 'owner-1', { joinViaLink: true });
    expect(snapshotProbes()).toBe(0);
    primeDb({ ...row, share_mode: 'private' });
    await getCanvas('canvas-1', 'visitor-2', { joinViaLink: true });
    expect(snapshotProbes()).toBe(0);
    expect(autoGrantSharePermission).not.toHaveBeenCalled();
  });

  it('does not enroll anyone on a plain access check', async () => {
    await getCanvas('canvas-1', 'visitor-2');
    expect(autoGrantSharePermission).not.toHaveBeenCalled();
  });

  it('does not enroll a visitor who has no access', async () => {
    checkDocumentAccess.mockResolvedValue({ hasAccess: false });
    const res = await getCanvas('canvas-1', 'visitor-2', { joinViaLink: true });
    expect(res.kind).toBe('forbidden');
    expect(autoGrantSharePermission).not.toHaveBeenCalled();
  });
});

describe('canvas write access (#4887)', () => {
  it('reports can_edit from the collab write rule, enrolled entry included', async () => {
    canWriteDocument.mockResolvedValue(true);
    const res = await getCanvas('canvas-1', 'visitor-2', { joinViaLink: true });
    expect(res.kind === 'ok' && res.canvas.can_edit).toBe(true);
    expect(canWriteDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'canvas-1',
        share_mode: 'authenticated',
        share_permission: 'viewer',
        permissions: { 'visitor-2': grant },
      }),
      'visitor-2'
    );
  });

  it('gates REST writes on the same rule', async () => {
    canWriteDocument.mockResolvedValue(true);
    expect(await checkCanvasWriteAccess('canvas-1', 'member-3')).toEqual({ kind: 'ok' });
    canWriteDocument.mockResolvedValue(false);
    expect(await checkCanvasWriteAccess('canvas-1', 'member-3')).toEqual({ kind: 'forbidden' });
  });

  it('still reports a missing canvas as not found', async () => {
    query.mockReset().mockResolvedValue([]);
    expect(await checkCanvasWriteAccess('canvas-1', 'member-3')).toEqual({ kind: 'not_found' });
    expect(canWriteDocument).not.toHaveBeenCalled();
  });

  it('lets the creator edit the canvas the create response seeds into the cache', async () => {
    query.mockReset().mockResolvedValue([row]);
    const canvas = await createCanvas('owner-1', { template_type: 'freeform' });
    expect(canvas.can_edit).toBe(true);
  });
});
