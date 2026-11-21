import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listJiraIssues, searchConfluenceCql, searchJiraIssues } from './atlassianClient.js';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const post = vi.mocked(axios.post);
const get = vi.mocked(axios.get);

const ISSUE = {
  id: '1',
  key: 'AB-1',
  fields: { summary: 's', status: { name: 'Open' }, issuetype: { name: 'Task' }, updated: 'now' },
};

beforeEach(() => vi.clearAllMocks());

describe('searchJiraIssues', () => {
  it('uses POST /search/jql with explicit fields and returns the page token', async () => {
    post.mockResolvedValue({ data: { issues: [ISSUE], nextPageToken: 'tok' } });
    const page = await searchJiraIssues('t', 'cloud', 'project = "AB"', { maxResults: 20 });
    const [url, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('https://api.atlassian.com/ex/jira/cloud/rest/api/3/search/jql');
    expect(body).toMatchObject({ jql: 'project = "AB"', maxResults: 20 });
    expect(body.fields).toEqual(
      expect.arrayContaining(['summary', 'status', 'assignee', 'priority'])
    );
    expect(page.nextPageToken).toBe('tok');
  });

  it('sends nextPageToken only when given', async () => {
    post.mockResolvedValue({ data: { issues: [] } });
    await searchJiraIssues('t', 'c', 'x', { nextPageToken: 'abc' });
    expect((post.mock.calls[0] as unknown[])[1]).toMatchObject({ nextPageToken: 'abc' });
    expect(get).not.toHaveBeenCalled();
  });
});

describe('listJiraIssues', () => {
  it('escapes the user query inside JQL', async () => {
    post.mockResolvedValue({ data: { issues: [ISSUE] } });
    await listJiraIssues('t', 'c', 'AB', 'say "hi" \\ there');
    const jql = ((post.mock.calls[0] as unknown[])[1] as { jql: string }).jql;
    expect(jql).toBe('project = "AB" AND text ~ "say \\"hi\\" \\\\ there" ORDER BY updated DESC');
  });

  it('falls back to a project listing without query', async () => {
    post.mockResolvedValue({ data: { issues: [] } });
    await listJiraIssues('t', 'c', 'AB');
    expect(((post.mock.calls[0] as unknown[])[1] as { jql: string }).jql).toBe(
      'project = "AB" ORDER BY updated DESC'
    );
  });
});

describe('searchConfluenceCql', () => {
  it('calls the v1 search endpoint', async () => {
    get.mockResolvedValue({
      data: {
        results: [{ title: 'T', content: { id: '9', type: 'page' } }],
        _links: { base: 'https://x/wiki' },
      },
    });
    const out = await searchConfluenceCql('t', 'c', 'type = page');
    expect((get.mock.calls[0] as unknown[])[0]).toBe(
      'https://api.atlassian.com/ex/confluence/c/wiki/rest/api/search'
    );
    expect(out.base).toBe('https://x/wiki');
    expect(out.results[0]?.content?.id).toBe('9');
  });
});
