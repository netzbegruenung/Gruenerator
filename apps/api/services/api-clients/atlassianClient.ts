import axios from 'axios';
import { z } from 'zod';

import {
  jiraProjectSchema,
  jiraSearchResponseSchema,
  jiraIssueSchema,
  confluenceSpaceListResponseSchema,
  confluencePageListResponseSchema,
  confluencePageContentSchema,
  confluenceSearchResponseSchema,
  atlassianResourceSchema,
  type JiraProject,
  type JiraIssue,
  type JiraAttachment,
  type ConfluenceSpace,
  type ConfluencePage,
  type ConfluencePageContent,
  type AtlassianResource,
} from './schemas/atlassian.js';

export type {
  JiraProject,
  JiraIssue,
  JiraAttachment,
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

export async function listJiraIssues(
  token: string,
  cloudId: string,
  projectKey: string,
  query?: string
): Promise<JiraIssue[]> {
  const jql = query
    ? `project = ${projectKey} AND text ~ "${query}" ORDER BY updated DESC`
    : `project = ${projectKey} ORDER BY updated DESC`;
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`,
    {
      headers: authHeaders(token),
      params: { jql, maxResults: 50, fields: 'summary,status,issuetype,updated,description' },
    }
  );
  return jiraSearchResponseSchema.parse(response.data).issues;
}

export async function getJiraIssue(
  token: string,
  cloudId: string,
  issueKey: string
): Promise<JiraIssue> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}`,
    {
      headers: authHeaders(token),
      params: { fields: 'summary,status,issuetype,updated,description,attachment' },
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
  pageId: string
): Promise<ConfluencePageContent> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages/${pageId}`,
    {
      headers: authHeaders(token),
      params: { 'body-format': 'view' },
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

// Helper: Get accessible Atlassian Cloud sites for a token
export async function getAccessibleResources(token: string): Promise<AtlassianResource[]> {
  const response = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: authHeaders(token),
  });
  return z.array(atlassianResourceSchema).parse(response.data);
}
