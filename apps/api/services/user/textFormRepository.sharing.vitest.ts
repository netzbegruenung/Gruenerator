/**
 * Group shares of a recipe against a fake database (#3803). A share row alone
 * grants nothing: every reader also requires `share_mode <> 'private'`, so
 * setting a recipe back to private revokes group access. Sharing therefore
 * promotes a private recipe to 'groups' — only after the ownership and
 * membership checks, so a refused share changes nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rawSql: string[] = [];
const ownRows: Array<{ id: string; kind: string }> = [];
const canShare = vi.fn(async () => ({}));

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({
      from: () => ({
        where: () => Object.assign(Promise.resolve([]), { limit: async () => ownRows }),
      }),
    }),
  }),
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: async (sql: string) => {
      rawSql.push(sql);
      return [];
    },
  }),
}));
vi.mock('../groups/groupMembership.js', () => ({ assertCanShareToGroup: canShare }));

const { listMentionableTextForms, listTextForms, shareTextFormWithGroup } =
  await import('./textFormRepository.js');

const FORM_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  rawSql.length = 0;
  ownRows.length = 0;
  canShare.mockReset().mockResolvedValue({});
});

describe('group-share readers skip private recipes', () => {
  it('listMentionableTextForms (and every GROUP_SHARE_EXISTS user)', async () => {
    await listMentionableTextForms('u1');
    const where = rawSql[0]?.slice(rawSql[0].indexOf('WHERE (')) ?? '';
    expect(where).toContain("tf.share_mode <> 'private' AND EXISTS");
  });

  it('listTextForms, shared-with-me half', async () => {
    await listTextForms('u1');
    const shared = rawSql.find((sql) => sql.includes('group_memberships'));
    expect(shared).toContain("tf.share_mode <> 'private'");
  });
});

describe('shareTextFormWithGroup', () => {
  it('promotes a private recipe to groups before inserting the share', async () => {
    ownRows.push({ id: FORM_ID, kind: 'custom' });
    await shareTextFormWithGroup('u1', 'mein-eigenes-rezept-3803', 'g1');
    expect(rawSql[0]).toMatch(/UPDATE user_text_forms SET share_mode = 'groups'/);
    expect(rawSql[0]).toContain("share_mode = 'private'");
    expect(rawSql[1]).toContain('INSERT INTO group_content_shares');
  });

  it('changes nothing when the caller may not share into the group', async () => {
    ownRows.push({ id: FORM_ID, kind: 'custom' });
    canShare.mockRejectedValue(new Error('kein Mitglied'));
    await shareTextFormWithGroup('u1', 'mein-eigenes-rezept-3803', 'g1');
    expect(rawSql.some((sql) => sql.includes('UPDATE'))).toBe(false);
  });

  it('changes nothing for a recipe that is not shareable', async () => {
    ownRows.push({ id: FORM_ID, kind: 'preset' });
    expect(await shareTextFormWithGroup('u1', 'mein-eigenes-rezept-3803', 'g1')).toBeNull();
    expect(rawSql).toEqual([]);
  });
});
