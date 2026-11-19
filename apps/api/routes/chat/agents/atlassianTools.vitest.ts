import { describe, expect, it, vi } from 'vitest';

import {
  atlassianFehler,
  chooseSite,
  makeAtlassianTool,
  type AtlassianApi,
} from './atlassianTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

type R = Record<string, unknown>;

const SITE = { id: 'c1', name: 'Gruene', url: 'https://gruene.atlassian.net/' };
const SITE2 = { id: 'c2', name: 'Partner', url: 'https://partner.atlassian.net' };

const ISSUE = {
  id: '1',
  key: 'AB-1',
  fields: {
    summary: 'Plakate drucken',
    status: { name: 'In Arbeit' },
    issuetype: { name: 'Aufgabe' },
    updated: '2026-11-01T10:00:00.000+0100',
    assignee: { displayName: 'Anna' },
    priority: { name: 'High' },
    description: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bitte bis Freitag.' }] }],
    },
  },
};

function setup(
  over: Partial<AtlassianApi> = {},
  opts: { jira?: boolean; confluence?: boolean; sites?: unknown[]; userId?: string | null } = {}
) {
  const registered: unknown[][] = [];
  const notes: string[] = [];
  const sourceRegistry = {
    register: (r: unknown[]) => {
      registered.push(r);
      return '[1] Auszug';
    },
    note: (t: string, c: string) => notes.push(`${t} ${c}`),
  } as unknown as SourceRegistry;
  const api = {
    getAccessibleResources: vi.fn(async () => opts.sites ?? [SITE]),
    listJiraProjects: vi.fn(async () => [
      { id: '1', key: 'AB', name: 'Alpha', projectTypeKey: 'software' },
    ]),
    searchJiraIssues: vi.fn(async () => ({ issues: [ISSUE], nextPageToken: null })),
    getJiraIssue: vi.fn(async () => ISSUE),
    listJiraComments: vi.fn(async () => [
      {
        id: 'k',
        author: { displayName: 'Ben' },
        created: '2026-11-02T08:00:00.000+0100',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Erledigt' }] }],
        },
      },
    ]),
    listConfluenceSpaces: vi.fn(async () => [
      { id: '1', key: 'DOC', name: 'Doku', type: 'global' },
    ]),
    searchConfluenceCql: vi.fn(async () => ({
      results: [
        {
          title: 'Satzung',
          excerpt: 'Auszug',
          url: '/spaces/DOC/pages/9/Satzung',
          content: { id: '9', type: 'page', title: 'Satzung' },
        },
      ],
      base: null,
    })),
    getConfluencePageContent: vi.fn(async () => ({
      id: '9',
      title: 'Satzung',
      _links: { webui: '/spaces/DOC/pages/9/Satzung', base: 'https://gruene.atlassian.net/wiki' },
      body: { view: { value: '<h1>Satzung</h1><p>§1 Name</p>' } },
    })),
    ...over,
  } as unknown as AtlassianApi;
  const getToken = vi.fn(async () => 'tok');
  const state = {
    agentConfig: { userId: opts.userId === undefined ? 'u1' : opts.userId },
  } as unknown as ChatGraphState;
  const tool = makeAtlassianTool({
    state,
    sourceRegistry,
    connections: { jira: opts.jira ?? true, confluence: opts.confluence ?? true },
    api,
    getToken,
  });
  const run = async (args: R) =>
    (await (tool.execute as (a: unknown, o: unknown) => Promise<R>)(args, {})) as R;
  return { run, api, getToken, registered, notes };
}

describe('site selection', () => {
  it('uses the only site', () => {
    expect(chooseSite([SITE], undefined)).toEqual({ site: SITE });
  });
  it('returns the list when several exist and none is named', () => {
    const r = chooseSite([SITE, SITE2], undefined);
    expect(r).toMatchObject({ result: { needsSite: true } });
  });
  it('matches by id, name and url', () => {
    expect(chooseSite([SITE, SITE2], 'c2')).toEqual({ site: SITE2 });
    expect(chooseSite([SITE, SITE2], 'gruene')).toEqual({ site: SITE });
    expect(chooseSite([SITE, SITE2], 'https://partner.atlassian.net/')).toEqual({ site: SITE2 });
  });
  it('reports an unknown site together with the options', () => {
    const r = chooseSite([SITE, SITE2], 'nope');
    expect(r).toMatchObject({
      result: { fehlerArt: 'ungueltige_eingabe', sites: [{ cloudId: 'c1' }, { cloudId: 'c2' }] },
    });
  });
});

describe('not connected', () => {
  it('refuses jira actions without a jira connection and calls nothing', async () => {
    const { run, api, getToken } = setup({}, { jira: false });
    const out = await run({ action: 'search_issues', text: 'x' });
    expect(String(out.error)).toContain('Jira ist für dieses Konto nicht verbunden');
    expect(String(out.naechsterSchritt)).toContain('Konnektoren');
    expect(getToken).not.toHaveBeenCalled();
    expect(api.searchJiraIssues).not.toHaveBeenCalled();
  });
  it('refuses confluence actions without a confluence connection', async () => {
    const { run } = setup({}, { confluence: false });
    expect(String((await run({ action: 'list_spaces' })).error)).toContain(
      'Confluence ist für dieses Konto nicht verbunden'
    );
  });
  it('needs a session', async () => {
    const { run } = setup({}, { userId: null });
    expect(String((await run({ action: 'list_sites' })).error)).toContain('Nutzer-Sitzung');
  });
});

describe('actions', () => {
  it('list_sites', async () => {
    const { run } = setup({}, { sites: [SITE, SITE2] });
    const out = await run({ action: 'list_sites' });
    expect(out.siteCount).toBe(2);
  });

  it('asks for a site when several exist', async () => {
    const { run, api } = setup({}, { sites: [SITE, SITE2] });
    const out = await run({ action: 'list_projects' });
    expect(out.needsSite).toBe(true);
    expect(api.listJiraProjects).not.toHaveBeenCalled();
  });

  it('list_projects', async () => {
    const out = await setup().run({ action: 'list_projects' });
    expect(out.projects).toEqual([{ key: 'AB', name: 'Alpha' }]);
  });

  it('search_issues turns text into escaped JQL and links to the site', async () => {
    const { run, api } = setup();
    const out = await run({ action: 'search_issues', text: 'a"b', projectKey: 'AB' });
    expect(api.searchJiraIssues).toHaveBeenCalledWith(
      'tok',
      'c1',
      'project = "AB" AND text ~ "a\\"b" ORDER BY updated DESC',
      expect.objectContaining({ maxResults: 20 })
    );
    const issues = out.issues as Array<R>;
    expect(issues[0]?.link).toBe('https://gruene.atlassian.net/browse/AB-1');
  });

  it('search_issues prefers raw jql and passes the page token on', async () => {
    const { run, api } = setup({
      searchJiraIssues: vi.fn(async () => ({ issues: [ISSUE], nextPageToken: 'n2' })),
    });
    const out = await run({
      action: 'search_issues',
      jql: 'assignee = currentUser()',
      nextPageToken: 'n1',
    });
    expect(api.searchJiraIssues).toHaveBeenCalledWith(
      'tok',
      'c1',
      'assignee = currentUser()',
      expect.objectContaining({ nextPageToken: 'n1' })
    );
    expect(out.nextPageToken).toBe('n2');
    expect(String(out.note)).toContain('weitere');
  });

  it('search_issues needs text or jql, and reports an empty result honestly', async () => {
    const { run } = setup({
      searchJiraIssues: vi.fn(async () => ({ issues: [], nextPageToken: null })),
    });
    expect((await run({ action: 'search_issues' })).fehlerArt).toBe('ungueltige_eingabe');
    expect((await run({ action: 'search_issues', text: 'zzz' })).resultCount).toBe(0);
  });

  it('get_issue extracts description and comments as plain text and registers a source', async () => {
    const { run, registered } = setup();
    const out = await run({ action: 'get_issue', key: 'AB-1' });
    expect(out.description).toBe('Bitte bis Freitag.');
    expect((out.comments as Array<R>)[0]?.text).toBe('Erledigt');
    expect(out.link).toBe('https://gruene.atlassian.net/browse/AB-1');
    const first = registered[0]?.[0] as R;
    expect(first.url).toBe('https://gruene.atlassian.net/browse/AB-1');
    expect(String(first.content)).toContain('Bitte bis Freitag.');
  });

  it('get_issue survives failing comments', async () => {
    const { run } = setup({
      listJiraComments: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const out = await run({ action: 'get_issue', key: 'AB-1' });
    expect(out.key).toBe('AB-1');
    expect(out.commentNote).toBeTruthy();
  });

  it('list_spaces', async () => {
    const out = await setup().run({ action: 'list_spaces' });
    expect((out.spaces as unknown[]).length).toBe(1);
  });

  it('search_pages builds CQL from text and resolves the web link', async () => {
    const { run, api } = setup();
    const out = await run({ action: 'search_pages', text: 'Satzung', spaceKey: 'DOC' });
    expect(api.searchConfluenceCql).toHaveBeenCalledWith(
      'tok',
      'c1',
      'type = page AND text ~ "Satzung" AND space = "DOC"',
      20
    );
    const pages = out.pages as Array<R>;
    expect(pages[0]?.pageId).toBe('9');
    expect(pages[0]?.link).toBe('https://gruene.atlassian.net/wiki/spaces/DOC/pages/9/Satzung');
  });

  it('get_page converts HTML to text, caps it and registers chunks with the link', async () => {
    const long = `<p>${'wort '.repeat(10_000)}</p>`;
    const { run, registered } = setup({
      getConfluencePageContent: vi.fn(async () => ({
        id: '9',
        title: 'Lang',
        body: { view: { value: long } },
      })),
    });
    const out = await run({ action: 'get_page', pageId: '9' });
    expect(out.resultCount).toBe(6);
    expect(String(out.note)).toContain('länger');
    expect(registered[0]?.length).toBe(6);

    const normal = await setup().run({ action: 'get_page', pageId: '9' });
    expect(normal.link).toBe('https://gruene.atlassian.net/wiki/spaces/DOC/pages/9/Satzung');
  });
});

describe('errors', () => {
  const axiosErr = (status: number) =>
    Object.assign(new Error('Request failed with status code ' + status + ' Bearer secret-token'), {
      response: { status },
    });

  it('maps 401, 403 and 429 to German hints without leaking the raw error', () => {
    const e401 = atlassianFehler(axiosErr(401), 'jira');
    expect(e401.error).toContain('abgelaufen');
    expect(e401.naechsterSchritt).toContain('Konnektoren');
    expect(atlassianFehler(axiosErr(403), 'confluence').error).toContain('Berechtigung');
    expect(atlassianFehler(axiosErr(429), 'jira').error).toContain('Rate-Limit');
    for (const s of [401, 403, 429, 500]) {
      expect(JSON.stringify(atlassianFehler(axiosErr(s), 'jira'))).not.toContain('secret-token');
    }
  });

  it('returns a tool failure instead of throwing', async () => {
    const { run, notes } = setup({
      listJiraProjects: vi.fn(async () => {
        throw axiosErr(403);
      }),
    });
    const out = await run({ action: 'list_projects' });
    expect(out.fehlerArt).toBe('keine_berechtigung');
    expect(notes.length).toBe(1);
  });
});
