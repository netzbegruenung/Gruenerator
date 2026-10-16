/**
 * Opening a sharepic from a "Mit Anmeldung" link enrolls the visitor as a
 * collaborator — the same way opening a document does — but only on the
 * studio's open read, never on the internal access checks through getCanvas.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, checkDocumentAccess, autoGrantSharePermission } = vi.hoisted(() => ({
  query: vi.fn(),
  checkDocumentAccess: vi.fn(),
  autoGrantSharePermission: vi.fn(),
}));

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../routes/docs/documentAccess.js', () => ({
  checkDocumentAccess,
  autoGrantSharePermission,
}));

const { getCanvas } = await import('./canvasRepository.js');

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

beforeEach(() => {
  query.mockReset().mockResolvedValue([row]);
  checkDocumentAccess.mockReset().mockResolvedValue({ hasAccess: true });
  autoGrantSharePermission.mockReset();
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
