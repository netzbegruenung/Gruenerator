/**
 * `listUserAgentsByIds` feeds the group-content `user_agents` bucket, which
 * every member of the group reads. A group share lets a teammate USE an agent,
 * not read its prompt (#3781).
 *
 * A group share row alone grants nothing: every reader that honours it also
 * requires `share_mode <> 'private'`, so an owner switching the agent back to
 * private revokes group access (#3784). Four readers carry the check — fixing
 * one leaves the others open, hence one test for all of them.
 */
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type UserAgentRow } from '../../database/schema/userAgents.js';

const rows: UserAgentRow[] = [];

const drizzleWhere = vi.fn(async (_condition: unknown) => rows);
const rawSql: string[] = [];

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({ from: () => ({ where: drizzleWhere }) }),
  }),
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    queryOne: async (sql: string) => {
      rawSql.push(sql);
      return null;
    },
    query: async (sql: string) => {
      rawSql.push(sql);
      return [];
    },
  }),
}));

const {
  getAccessibleUserAgentById,
  getGroupSharedUserAgent,
  listMentionableUserAgents,
  listUserAgentsByIds,
} = await import('./userAgentsRepository.js');

function row(overrides: Partial<UserAgentRow> = {}): UserAgentRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    identifier: 'klima-bot',
    title: 'Klima-Bot',
    description: 'Schreibt Klima-Posts',
    system_role: 'GEHEIMER PROMPT',
    avatar: '',
    icon_key: null,
    background_color: '#fff',
    tags: [],
    model: 'mistral-medium-2604',
    default_model: null,
    provider: 'mistral',
    params: { max_tokens: 1000, temperature: 0.7 },
    opening_message: 'Hallo',
    opening_questions: [],
    locale: 'de-DE',
    author: 'Anna',
    default_notebook_ids: null,
    share_mode: 'groups',
    is_public: false,
    public_ownership: null,
    plugins: null,
    enabled_tools: null,
    skill_mentions: null,
    default_recipe_mention: null,
    default_recipe_id: null,
    inline_source_links: null,
    few_shot_examples: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as UserAgentRow;
}

describe('listUserAgentsByIds', () => {
  beforeEach(() => {
    rows.length = 0;
  });

  it('carries the share-matching id but never the prompt', async () => {
    rows.push(row());
    const [agent] = await listUserAgentsByIds(['11111111-1111-4111-8111-111111111111']);
    expect(agent).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      identifier: 'klima-bot',
      title: 'Klima-Bot',
    });
    expect(agent).not.toHaveProperty('systemRole');
    expect(JSON.stringify(agent)).not.toContain('GEHEIMER PROMPT');
  });
});

describe('group-share readers skip private agents', () => {
  beforeEach(() => {
    rows.length = 0;
    rawSql.length = 0;
    drizzleWhere.mockClear();
  });

  it.each([
    ['getGroupSharedUserAgent', () => getGroupSharedUserAgent('klima-bot', 'u2')],
    [
      'getAccessibleUserAgentById',
      () => getAccessibleUserAgentById('11111111-1111-4111-8111-111111111111', 'u2'),
    ],
    ['listMentionableUserAgents', () => listMentionableUserAgents('u2')],
  ])('%s filters the group branch on share_mode', async (_name, call) => {
    await call();
    const groupQuery = rawSql.find((sql) => sql.includes('group_content_shares'));
    expect(groupQuery).toBeDefined();
    expect(groupQuery).toContain("ua.share_mode <> 'private'");
  });

  it('listUserAgentsByIds (group feed) filters on share_mode', async () => {
    await listUserAgentsByIds(['11111111-1111-4111-8111-111111111111']);
    const query = new PgDialect().sqlToQuery(drizzleWhere.mock.calls[0]?.[0] as SQL);
    expect(query.sql).toContain('"share_mode" <> $');
    expect(query.params).toContain('private');
  });
});
