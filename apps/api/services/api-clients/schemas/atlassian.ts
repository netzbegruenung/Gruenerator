import { z } from 'zod';

// ── Jira ──────────────────────────────────────────────────────────────────────

export const jiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  projectTypeKey: z.string(),
});

export type JiraProject = z.infer<typeof jiraProjectSchema>;

export const jiraAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  content: z.string(),
});

export type JiraAttachment = z.infer<typeof jiraAttachmentSchema>;

export const jiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    status: z.object({ name: z.string() }),
    issuetype: z.object({ name: z.string() }),
    updated: z.string(),
    description: z.unknown().optional(),
    attachment: z.array(jiraAttachmentSchema).optional(),
  }),
});

export type JiraIssue = z.infer<typeof jiraIssueSchema>;

// ── Jira paginated search (/rest/api/3/search) ────────────────────────────────

export const jiraSearchResponseSchema = z.object({
  issues: z.array(jiraIssueSchema),
});

export type JiraSearchResponse = z.infer<typeof jiraSearchResponseSchema>;

// ── Confluence ────────────────────────────────────────────────────────────────

export const confluenceSpaceSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  type: z.string(),
});

export type ConfluenceSpace = z.infer<typeof confluenceSpaceSchema>;

export const confluencePageSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  spaceId: z.string(),
  version: z.object({
    number: z.number(),
    createdAt: z.string(),
  }),
});

export type ConfluencePage = z.infer<typeof confluencePageSchema>;

export const confluencePageContentSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.object({
    view: z.object({ value: z.string() }).optional(),
    storage: z.object({ value: z.string() }).optional(),
  }),
});

export type ConfluencePageContent = z.infer<typeof confluencePageContentSchema>;

// ── Confluence paginated lists ────────────────────────────────────────────────

export const confluenceSpaceListResponseSchema = z.object({
  results: z.array(confluenceSpaceSchema),
});

export type ConfluenceSpaceListResponse = z.infer<typeof confluenceSpaceListResponseSchema>;

export const confluencePageListResponseSchema = z.object({
  results: z.array(confluencePageSchema),
});

export type ConfluencePageListResponse = z.infer<typeof confluencePageListResponseSchema>;

// ── Confluence search (/wiki/api/v2/search) ───────────────────────────────────
// The `content` property is a ConfluencePage; other envelope fields are optional.

export const confluenceSearchResultItemSchema = z.object({
  content: confluencePageSchema,
});

export const confluenceSearchResponseSchema = z.object({
  results: z.array(confluenceSearchResultItemSchema).optional(),
});

export type ConfluenceSearchResponse = z.infer<typeof confluenceSearchResponseSchema>;

// ── Accessible resources (/oauth/token/accessible-resources) ─────────────────

export const atlassianResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
});

export type AtlassianResource = z.infer<typeof atlassianResourceSchema>;
