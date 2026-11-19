import axios from 'axios';
import { z } from 'zod';

import { buildTextJql, quoteQueryValue } from './atlassianText.js';
import {
  jiraProjectSchema,
  jiraSearchResponseSchema,
  jiraIssueSchema,
  confluenceSpaceListResponseSchema,
  confluencePageListResponseSchema,
  confluencePageContentSchema,
  confluenceSearchResponseSchema,
  confluenceCqlResponseSchema,
  jiraCommentListResponseSchema,
  atlassianResourceSchema,
  type JiraProject,
  type JiraIssue,
  type JiraAttachment,
  type JiraComment,
  type ConfluenceCqlResult,
  type ConfluenceSpace,
  type ConfluencePage,
  type ConfluencePageContent,
  type AtlassianResource,
} from './schemas/atlassian.js';

export type {
  JiraProject,
  JiraIssue,
  JiraAttachment,
  JiraComment,
  ConfluenceCqlResult,
  ConfluenceSpace,
  ConfluencePage,
  ConfluencePageContent,
  AtlassianResource,
} from './schemas/atlassian.js';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Jira

export async function listJiraProjects(token: string, cloudId: string): Promise<JiraProject[]> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project`,
    { headers: authHeaders(token) }
  );
  return z.array(jiraProjectSchema).parse(response.data);
}

const JIRA_SEARCH_FIELDS = ['summary', 'status', 'issuetype', 'updated', 'assignee', 'priority'];

export interface JiraSearchPage {
  issues: JiraIssue[];
  /** Present when more results exist; pass it back as `nextPageToken`. */
  nextPageToken: string | null;
}

/**
 * JQL search. The old `GET /rest/api/3/search` is deprecated; this uses
 * `POST /rest/api/3/search/jql`, which needs explicit `fields` and paginates
 * with `nextPageToken`.
 * https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post
 */
export async function searchJiraIssues(
  token: string,
  cloudId: string,
  jql: string,
  opts: { maxResults?: number; nextPageToken?: string | null } = {}
): Promise<JiraSearchPage> {
  const response = await axios.post(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
    {
      jql,
      fields: JIRA_SEARCH_FIELDS,
      maxResults: opts.maxResults ?? 50,
      ...(opts.nextPageToken ? { nextPageToken: opts.nextPageToken } : {}),
    },
    { headers: authHeaders(token) }
  );
  const parsed = jiraSearchResponseSchema.parse(response.data);
  return { issues: parsed.issues, nextPageToken: parsed.nextPageToken ?? null };
}

export async function listJiraIssues(
  token: string,
  cloudId: string,
  projectKey: string,
  query?: string
): Promise<JiraIssue[]> {
  const jql =
    (query ? buildTextJql(query, projectKey) : null) ??
    `project = ${quoteQueryValue(projectKey)} ORDER BY updated DESC`;
  return (await searchJiraIssues(token, cloudId, jql, { maxResults: 50 })).issues;
}

/** Latest comments first (`orderBy=-created`). Bodies are ADF. */
export async function listJiraComments(
  token: string,
  cloudId: string,
  issueKey: string,
  maxResults = 5
): Promise<JiraComment[]> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    { headers: authHeaders(token), params: { orderBy: '-created', maxResults } }
  );
  return jiraCommentListResponseSchema.parse(response.data).comments;
}

export async function getJiraIssue(
  token: string,
  cloudId: string,
  issueKey: string
): Promise<JiraIssue> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    {
      headers: authHeaders(token),
      params: {
        fields: 'summary,status,issuetype,updated,description,attachment,assignee,priority',
      },
    }
  );
  return jiraIssueSchema.parse(response.data);
}

export async function getJiraIssueAttachments(
  token: string,
  cloudId: string,
  issueKey: string
): Promise<JiraAttachment[]> {
  const issue = await getJiraIssue(token, cloudId, issueKey);
  return issue.fields.attachment ?? [];
}

// Confluence

export async function listConfluenceSpaces(
  token: string,
  cloudId: string
): Promise<ConfluenceSpace[]> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces`,
    {
      headers: authHeaders(token),
      params: { limit: 50 },
    }
  );
  return confluenceSpaceListResponseSchema.parse(response.data).results;
}

export async function listConfluencePages(
  token: string,
  cloudId: string,
  spaceId: string
): Promise<ConfluencePage[]> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces/${spaceId}/pages`,
    {
      headers: authHeaders(token),
      params: { limit: 50, sort: '-modified-date' },
    }
  );
  return confluencePageListResponseSchema.parse(response.data).results;
}

export async function getConfluencePageContent(
  token: string,
  cloudId: string,
  pageId: string,
  bodyFormat: 'view' | 'storage' = 'view'
): Promise<ConfluencePageContent> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages/${pageId}`,
    {
      headers: authHeaders(token),
      params: { 'body-format': bodyFormat },
    }
  );
  return confluencePageContentSchema.parse(response.data);
}

export async function searchConfluenceContent(
  token: string,
  cloudId: string,
  query: string
): Promise<ConfluencePage[]> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/search`,
    {
      headers: authHeaders(token),
      params: { query, limit: 20 },
    }
  );
  return confluenceSearchResponseSchema.parse(response.data).results?.map((r) => r.content) ?? [];
}

/**
 * CQL search (v1 — v2 has no full-text search).
 * https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-search/#api-wiki-rest-api-search-get
 */
export async function searchConfluenceCql(
  token: string,
  cloudId: string,
  cql: string,
  limit = 20
): Promise<{ results: ConfluenceCqlResult[]; base: string | null }> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/rest/api/search`,
    { headers: authHeaders(token), params: { cql, limit } }
  );
  const parsed = confluenceCqlResponseSchema.parse(response.data);
  return { results: parsed.results, base: parsed._links?.base ?? null };
}

// Helper: Get accessible Atlassian Cloud sites for a token
export async function getAccessibleResources(token: string): Promise<AtlassianResource[]> {
  const response = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: authHeaders(token),
  });
  return z.array(atlassianResourceSchema).parse(response.data);
}
