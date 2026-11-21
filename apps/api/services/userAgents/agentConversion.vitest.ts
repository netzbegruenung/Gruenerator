import { GROUP_INSTRUCTIONS_MAX, MAX_TEXT_FORM_STYLE_CHARS } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  convertUserAgent,
  planAgentConversion,
  type AgentConversionDeps,
  type AgentConversionFacts,
} from './agentConversion.js';

import type { UserAgentRecord } from './userAgentsRepository.js';

const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const RECIPE_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

function agent(over: Partial<UserAgentRecord> = {}): UserAgentRecord {
  return {
    id: AGENT_ID,
    identifier: 'pressearbeit-kv',
    title: 'Pressearbeit KV',
    description: 'Schreibt Pressemitteilungen für den Kreisverband.',
    systemRole: 'Du schreibst Pressemitteilungen für den KV Musterstadt.',
    avatar: '📰',
    backgroundColor: '#336633',
    tags: [],
    model: 'mistral-large-latest',
    provider: 'mistral',
    params: { max_tokens: 4000, temperature: 0.7 },
    openingMessage: '',
    openingQuestions: [],
    locale: 'de-DE',
    author: 'Kim',
    ...over,
  } as UserAgentRecord;
}

const NO_FACTS: AgentConversionFacts = {
  isPublic: false,
  groupShareCount: 0,
  recurringTaskCount: 0,
};

function deps(over: Partial<AgentConversionDeps> = {}) {
  const d: AgentConversionDeps = {
    getAgent: vi.fn(async () => agent()),
    readFacts: vi.fn(async () => NO_FACTS),
    listAgentGroupIds: vi.fn(async () => []),
    successorPath: vi.fn(async () => null),
    takenMentions: vi.fn(async () => new Set<string>()),
    createRecipe: vi.fn(async (_u, input) => ({ id: RECIPE_ID, mention: input.mention })),
    createProject: vi.fn(async (_u, input) => ({
      id: PROJECT_ID,
      name: input.name,
      slugSuffix: 'abc234',
    })),
    trashProject: vi.fn(async () => 'ok'),
    setInstructions: vi.fn(async () => ({})),
    share: vi.fn(async () => ({ status: 200 as const, success: true, message: 'ok' })),
    setSuccessor: vi.fn(async () => true),
    ...over,
  };
  return d;
}

const RUN = {
  userId: 'u1',
  sharerName: 'Kim',
  handle: 'pressearbeit-kv',
  dryRun: false,
  fresh: false,
};

describe('planAgentConversion', () => {
  it('lists only the parts the agent actually has', () => {
    const plan = planAgentConversion(agent(), 'recipe', NO_FACTS);
    expect(plan.blocked).toBeNull();
    expect(plan.items.map((i) => i.part)).toEqual(['role']);
  });

  it('never truncates a role: a long one blocks the target and says why', () => {
    const long = agent({ systemRole: 'x'.repeat(MAX_TEXT_FORM_STYLE_CHARS + 1) });
    expect(planAgentConversion(long, 'recipe', NO_FACTS).blocked).toMatch(/Rezept fasst höchstens/);

    const mid = agent({ systemRole: 'x'.repeat(GROUP_INSTRUCTIONS_MAX + 1) });
    expect(planAgentConversion(mid, 'recipe', NO_FACTS).blocked).toBeNull();
    expect(planAgentConversion(mid, 'project', NO_FACTS).blocked).toMatch(/Projekt-Anweisungen/);
  });

  it('counts the default-recipe hint into the project instruction length', () => {
    const almost = agent({
      systemRole: 'x'.repeat(GROUP_INSTRUCTIONS_MAX - 5),
      defaultRecipeMention: 'presse',
    });
    expect(planAgentConversion(almost, 'project', NO_FACTS).blocked).not.toBeNull();
  });

  it('drops tools and model, keeps tasks on the agent, never re-publishes', () => {
    const rich = agent({ enabledTools: ['web_search'], defaultModel: 'gruenerator-ultra' });
    const plan = planAgentConversion(rich, 'recipe', {
      isPublic: true,
      groupShareCount: 2,
      recurringTaskCount: 1,
    });
    const byPart = Object.fromEntries(plan.items.map((i) => [i.part, i.outcome]));
    expect(byPart).toMatchObject({
      tools: 'dropped',
      model: 'dropped',
      public: 'dropped',
      groupShares: 'carried',
      recurringTasks: 'later',
    });
  });

  it('notebooks: a recipe cannot take them yet, a project shares them', () => {
    const nb = agent({ defaultNotebookIds: ['bayern-notebook'] });
    expect(planAgentConversion(nb, 'recipe', NO_FACTS).items[1]).toMatchObject({
      part: 'notebooks',
      outcome: 'later',
    });
    expect(planAgentConversion(nb, 'project', NO_FACTS).items[1]).toMatchObject({
      part: 'notebooks',
      outcome: 'carried',
      note: '1 Notebook wird ins Projekt geteilt; Chats im Projekt durchsuchen sie von selbst.',
    });
  });
});

describe('convertUserAgent', () => {
  it('dry run creates nothing', async () => {
    const d = deps();
    const out = await convertUserAgent({ ...RUN, target: 'recipe', dryRun: true }, d);
    expect(out.ok && out.response.result).toBeNull();
    expect(d.createRecipe).not.toHaveBeenCalled();
    expect(d.setSuccessor).not.toHaveBeenCalled();
  });

  it('a blocked target creates nothing even without dry run', async () => {
    const d = deps({ getAgent: vi.fn(async () => agent({ systemRole: 'x'.repeat(9000) })) });
    const out = await convertUserAgent({ ...RUN, target: 'recipe' }, d);
    expect(out.ok && out.response.blocked).toBeTruthy();
    expect(d.createRecipe).not.toHaveBeenCalled();
  });

  it('recipe: free mention, role as style block, few-shot outputs as examples, successor stored', async () => {
    const d = deps({
      getAgent: vi.fn(async () =>
        agent({ fewShotExamples: [{ input: 'Thema', output: 'Fertige PM' }] })
      ),
      takenMentions: vi.fn(async () => new Set(['pressearbeit-kv'])),
    });
    const out = await convertUserAgent({ ...RUN, target: 'recipe' }, d);
    expect(d.createRecipe).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        mention: 'pressearbeit-kv-2',
        styleBlock: 'Du schreibst Pressemitteilungen für den KV Musterstadt.',
        examples: [{ content: 'Fertige PM' }],
      })
    );
    expect(d.setSuccessor).toHaveBeenCalledWith('u1', AGENT_ID, { kind: 'recipe', ref: RECIPE_ID });
    expect(out.ok && out.response.result?.path).toBe('/agentura/rezept/pressearbeit-kv-2');
  });

  it("recipe: shares into the agent's projects and reports the ones that failed", async () => {
    const share = vi
      .fn<AgentConversionDeps['share']>()
      .mockResolvedValueOnce({ status: 200, success: true, message: 'ok' })
      .mockRejectedValueOnce(new Error('kein Mitglied'));
    const d = deps({
      readFacts: vi.fn(async () => ({ ...NO_FACTS, groupShareCount: 2 })),
      listAgentGroupIds: vi.fn(async () => ['g1', 'g2']),
      share,
    });
    const out = await convertUserAgent({ ...RUN, target: 'recipe' }, d);
    const item = out.ok ? out.response.items.find((i) => i.part === 'groupShares') : null;
    expect(item).toMatchObject({ outcome: 'later' });
    expect(item?.note).toMatch(/in 1 Projekt geteilt; in 1 Projekt darfst du nicht/);
  });

  it('second call returns the living successor instead of a copy', async () => {
    const d = deps({
      getAgent: vi.fn(async () => agent({ migratedTo: { recipe: RECIPE_ID } })),
      successorPath: vi.fn(async () => '/agentura/rezept/pressearbeit-kv'),
    });
    const out = await convertUserAgent({ ...RUN, target: 'recipe' }, d);
    expect(out.ok && out.response.alreadyConverted).toBe(true);
    expect(d.createRecipe).not.toHaveBeenCalled();

    await convertUserAgent({ ...RUN, target: 'recipe', fresh: true }, d);
    expect(d.createRecipe).toHaveBeenCalledTimes(1);
  });

  it('a trashed successor does not count: converting again creates a new one', async () => {
    const d = deps({
      getAgent: vi.fn(async () => agent({ migratedTo: { recipe: RECIPE_ID } })),
      successorPath: vi.fn(async () => null),
    });
    await convertUserAgent({ ...RUN, target: 'recipe' }, d);
    expect(d.createRecipe).toHaveBeenCalledTimes(1);
  });

  it('project: personal project, instructions with recipe hint, notebooks shared by kind', async () => {
    const d = deps({
      getAgent: vi.fn(async () =>
        agent({
          defaultRecipeMention: 'presse',
          defaultNotebookIds: ['bayern-notebook', '44444444-4444-4444-8444-444444444444'],
        })
      ),
    });
    const out = await convertUserAgent({ ...RUN, target: 'project' }, d);
    expect(d.setInstructions).toHaveBeenCalledWith(
      PROJECT_ID,
      'u1',
      'Du schreibst Pressemitteilungen für den KV Musterstadt.\n\nFür Texte nutzt du das Rezept @presse.'
    );
    const types = vi.mocked(d.share).mock.calls.map((c) => c[0].contentType);
    expect(types).toEqual(['system_notebooks', 'notebook_collections']);
    expect(out.ok && out.response.result?.path).toBe('/projekte/pressearbeit-kv-abc234');
  });

  it('project: failing instructions put the empty project back in the trash', async () => {
    const d = deps({ setInstructions: vi.fn(async () => Promise.reject(new Error('db'))) });
    await expect(convertUserAgent({ ...RUN, target: 'project' }, d)).rejects.toThrow('db');
    expect(d.trashProject).toHaveBeenCalledWith('u1', PROJECT_ID);
    expect(d.setSuccessor).not.toHaveBeenCalled();
  });

  it('remembers each target: a project successor neither blocks nor replaces the recipe one', async () => {
    const d = deps({
      getAgent: vi.fn(async () =>
        agent({ migratedTo: { recipe: RECIPE_ID, project: PROJECT_ID } })
      ),
      successorPath: vi.fn(async (_u, s) =>
        s.kind === 'recipe' ? '/agentura/rezept/pressearbeit-kv' : '/projekte/p-abc234'
      ),
    });
    const recipe = await convertUserAgent({ ...RUN, target: 'recipe' }, d);
    const project = await convertUserAgent({ ...RUN, target: 'project' }, d);
    expect(recipe.ok && recipe.response.result?.ref).toBe(RECIPE_ID);
    expect(project.ok && project.response.result?.ref).toBe(PROJECT_ID);
    expect(d.createRecipe).not.toHaveBeenCalled();
    expect(d.createProject).not.toHaveBeenCalled();
  });

  it('builds the mention from the identifier, not from a long title', async () => {
    const d = deps({
      getAgent: vi.fn(async () =>
        agent({
          identifier: 'pm-kv',
          title: 'Pressearbeit für den Kreisverband Musterstadt mit langem Titel',
        })
      ),
    });
    await convertUserAgent({ ...RUN, target: 'recipe' }, d);
    expect(vi.mocked(d.createRecipe).mock.calls[0]?.[1].mention).toBe('pm-kv');
  });

  it('says "dasselbe Projekt" for a single project share', async () => {
    const d = deps({
      readFacts: vi.fn(async () => ({ ...NO_FACTS, groupShareCount: 1 })),
      listAgentGroupIds: vi.fn(async () => ['g1']),
    });
    const plan = planAgentConversion(agent(), 'recipe', { ...NO_FACTS, groupShareCount: 1 });
    expect(plan.items.find((i) => i.part === 'groupShares')?.note).toBe(
      'Das Rezept wird in dasselbe Projekt geteilt.'
    );
    const out = await convertUserAgent({ ...RUN, target: 'recipe' }, d);
    expect(out.ok && out.response.items.find((i) => i.part === 'groupShares')?.note).toBe(
      'Das Rezept ist in dasselbe Projekt geteilt.'
    );
  });

  it('unknown agent is a 404', async () => {
    const d = deps({ getAgent: vi.fn(async () => undefined) });
    expect(await convertUserAgent({ ...RUN, target: 'recipe' }, d)).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});
