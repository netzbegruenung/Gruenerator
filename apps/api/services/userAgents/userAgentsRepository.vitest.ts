/**
 * `listUserAgentsByIds` feeds the group-content `user_agents` bucket, which
 * every member of the group reads. A group share lets a teammate USE an agent,
 * not read its prompt (#3781).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type UserAgentRow } from '../../database/schema/userAgents.js';

const rows: UserAgentRow[] = [];

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({ from: () => ({ where: async () => rows }) }),
  }),
}));
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({}),
}));

const { listUserAgentsByIds } = await import('./userAgentsRepository.js');

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
