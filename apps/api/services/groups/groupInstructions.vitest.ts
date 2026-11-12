import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryOne = vi.fn();
const checkMembership = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ queryOne }),
}));
vi.mock('./groupMembership.js', () => ({
  getPostgresAndCheckMembership: (g: string, u: string, admin?: boolean) =>
    checkMembership(g, u, admin),
}));

const { getProjectInstructions, setProjectInstructions, readThreadProjectInstructions } =
  await import('./groupInstructions.js');

const GROUP = 'g1';

beforeEach(() => {
  queryOne.mockReset();
  checkMembership.mockReset().mockResolvedValue({ postgres: { queryOne } });
});

describe('getProjectInstructions', () => {
  it('is open to members and returns the text', async () => {
    queryOne.mockResolvedValue({
      custom_prompt: 'Im Du schreiben.',
      updated_at: new Date('2026-11-13T10:00:00Z'),
    });
    const out = await getProjectInstructions(GROUP, 'u1');
    expect(checkMembership).toHaveBeenCalledWith(GROUP, 'u1', undefined);
    expect(out).toEqual({
      instructions: 'Im Du schreiben.',
      updatedAt: '2026-11-13T10:00:00.000Z',
    });
  });

  it('answers empty when no row exists', async () => {
    queryOne.mockResolvedValue(null);
    expect(await getProjectInstructions(GROUP, 'u1')).toEqual({
      instructions: '',
      updatedAt: null,
    });
  });

  it("lets a non-member's rejection through", async () => {
    checkMembership.mockRejectedValue(new Error('Du bist nicht Mitglied dieser Gruppe.'));
    await expect(getProjectInstructions(GROUP, 'u1')).rejects.toThrow('Mitglied');
  });
});

describe('setProjectInstructions', () => {
  it('requires a Projekt admin', async () => {
    checkMembership.mockRejectedValue(new Error('Keine Berechtigung für diese Aktion.'));
    await expect(setProjectInstructions(GROUP, 'u1', 'x')).rejects.toThrow('Berechtigung');
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('upserts the trimmed text as enabled', async () => {
    queryOne.mockResolvedValue({
      custom_prompt: 'Kurz.',
      updated_at: new Date('2026-11-13T10:00:00Z'),
    });
    const out = await setProjectInstructions(GROUP, 'u1', '  Kurz.  ');
    expect(checkMembership).toHaveBeenCalledWith(GROUP, 'u1', true);
    expect(queryOne.mock.calls[0][1]).toEqual([GROUP, 'Kurz.', true]);
    expect(out.instructions).toBe('Kurz.');
  });

  it('turns an empty text into "disabled" instead of an active empty instruction', async () => {
    queryOne.mockResolvedValue({ custom_prompt: '', updated_at: null });
    const out = await setProjectInstructions(GROUP, 'u1', '   ');
    expect(queryOne.mock.calls[0][1]).toEqual([GROUP, '', false]);
    expect(out).toEqual({ instructions: '', updatedAt: null });
  });
});

describe('readThreadProjectInstructions', () => {
  it('returns the project name and trimmed text for the member own thread', async () => {
    queryOne.mockResolvedValue({ name: 'Wärmeplanung', custom_prompt: ' Antworte im Du. ' });
    expect(await readThreadProjectInstructions('t1', 'u1')).toEqual({
      projectName: 'Wärmeplanung',
      text: 'Antworte im Du.',
    });
    const sql = String(queryOne.mock.calls[0][0]);
    expect(sql).toMatch(/gm\.is_active = TRUE/);
    expect(sql).toMatch(/instructions_enabled/);
    expect(sql).toMatch(/t\.user_id = \$2/);
    expect(sql).toMatch(/g\.deleted_at IS NULL/);
  });

  it('is null without a row or with an empty text', async () => {
    queryOne.mockResolvedValue(null);
    expect(await readThreadProjectInstructions('t1', 'u1')).toBeNull();
    queryOne.mockResolvedValue({ name: 'P', custom_prompt: '   ' });
    expect(await readThreadProjectInstructions('t1', 'u1')).toBeNull();
  });
});
