import axios from 'axios';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Jira

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    updated: string;
    description?: any;
  };
}

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;
}

export async function listJiraProjects(
  token: string,
  cloudId: string,
): Promise<JiraProject[]> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project`,
    { headers: authHeaders(token) },
  );
  return response.data;
}

export async function listJiraIssues(
  token: string,
  cloudId: string,
  projectKey: string,
  query?: string,
): Promise<JiraIssue[]> {
  const jql = query
    ? `project = ${projectKey} AND text ~ "${query}" ORDER BY updated DESC`
    : `project = ${projectKey} ORDER BY updated DESC`;
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`,
    {
      headers: authHeaders(token),
      params: { jql, maxResults: 50, fields: 'summary,status,issuetype,updated,description' },
    },
  );
  return response.data.issues;
}

export async function getJiraIssue(
  token: string,
  cloudId: string,
  issueKey: string,
): Promise<JiraIssue> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}`,
    {
      headers: authHeaders(token),
      params: { fields: 'summary,status,issuetype,updated,description,attachment' },
    },
  );
  return response.data;
}

export async function getJiraIssueAttachments(
  token: string,
  cloudId: string,
  issueKey: string,
): Promise<JiraAttachment[]> {
  const issue = await getJiraIssue(token, cloudId, issueKey);
  return (issue.fields as any).attachment ?? [];
}

// Confluence

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
}

export interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  version: { number: number; createdAt: string };
}

export interface ConfluencePageContent {
  id: string;
  title: string;
  body: {
    view?: { value: string };
    storage?: { value: string };
  };
}

export async function listConfluenceSpaces(
  token: string,
  cloudId: string,
): Promise<ConfluenceSpace[]> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces`,
    {
      headers: authHeaders(token),
      params: { limit: 50 },
    },
  );
  return response.data.results;
}

export async function listConfluencePages(
  token: string,
  cloudId: string,
  spaceId: string,
): Promise<ConfluencePage[]> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces/${spaceId}/pages`,
    {
      headers: authHeaders(token),
      params: { limit: 50, sort: '-modified-date' },
    },
  );
  return response.data.results;
}

export async function getConfluencePageContent(
  token: string,
  cloudId: string,
  pageId: string,
): Promise<ConfluencePageContent> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages/${pageId}`,
    {
      headers: authHeaders(token),
      params: { 'body-format': 'view' },
    },
  );
  return response.data;
}

export async function searchConfluenceContent(
  token: string,
  cloudId: string,
  query: string,
): Promise<ConfluencePage[]> {
  const response = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/search`,
    {
      headers: authHeaders(token),
      params: { query, limit: 20 },
    },
  );
  return response.data.results?.map((r: any) => r.content) ?? [];
}

// Helper: Get accessible Atlassian Cloud sites for a token
export async function getAccessibleResources(token: string): Promise<Array<{ id: string; name: string; url: string }>> {
  const response = await axios.get(
    'https://api.atlassian.com/oauth/token/accessible-resources',
    { headers: authHeaders(token) },
  );
  return response.data;
}
