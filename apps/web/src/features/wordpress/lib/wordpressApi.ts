import { getContractsClient } from '@gruenerator/shared/api';

import apiClient from '@/components/utils/apiClient';

// ── API response shapes ────────────────────────────────────────────────

interface SitesResponse {
  success: boolean;
  message?: string;
  sites?: WordPressSite[];
}

interface SiteResponse {
  success: boolean;
  message?: string;
  site?: WordPressSite;
}

interface PostsResponse {
  success: boolean;
  message?: string;
  posts?: WordPressPost[];
}

interface CategoriesResponse {
  success: boolean;
  message?: string;
  categories?: WordPressCategory[];
}

// ── Types ─────────────────────────────────────────────────────────────

export interface WordPressSite {
  id: string;
  site_url: string;
  username: string;
  label: string | null;
  has_credentials: boolean;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  last_error: string | null;
}

export interface WordPressPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  status: string;
  link: string;
  date: string;
  categories: number[];
  tags: number[];
}

export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface WordPressConnectionTestResult {
  success: boolean;
  username: string | null;
  displayName: string | null;
  canPublish: boolean;
  siteName: string | null;
  siteDescription: string | null;
  error: string | null;
  errorCode: string | null;
}

export interface WordPressPublishResult {
  success: boolean;
  postId: number | null;
  editUrl: string | null;
  viewUrl: string | null;
  status: string | null;
}

// ── API Functions ─────────────────────────────────────────────────────

// NOT in contract — stays on raw apiClient
export async function fetchWordPressSites(): Promise<WordPressSite[]> {
  const response = await apiClient.get<SitesResponse>('/wordpress/sites');
  if (response.data?.success) {
    return response.data.sites ?? [];
  }
  throw new Error(response.data?.message ?? 'Fehler beim Laden der WordPress-Seiten');
}

export async function addWordPressSite(
  siteUrl: string,
  username: string,
  appPassword: string,
  label: string | null
): Promise<WordPressSite> {
  const client = getContractsClient();
  const result = await client.wordpress.connectSite({
    body: {
      siteUrl: siteUrl.trim(),
      username: username.trim(),
      appPassword: appPassword.trim(),
      label: label?.trim() ?? null,
    },
  });
  if (result.status !== 201) {
    throw new Error(`Fehler beim Hinzufügen der WordPress-Seite (HTTP ${result.status})`);
  }
  const site = result.body.site as WordPressSite | undefined;
  if (!site) {
    throw new Error('Fehler beim Hinzufügen der WordPress-Seite');
  }
  return site;
}

// NOT in contract — stays on raw apiClient
export async function deleteWordPressSite(id: string): Promise<void> {
  const response = await apiClient.delete<SiteResponse>(`/wordpress/sites/${id}`);
  if (!response.data?.success) {
    throw new Error(response.data?.message ?? 'Fehler beim Löschen der WordPress-Seite');
  }
}

export async function testWordPressConnection(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<WordPressConnectionTestResult> {
  const client = getContractsClient();
  const result = await client.wordpress.testConnection({
    body: {
      siteUrl: siteUrl.trim(),
      username: username.trim(),
      appPassword: appPassword.trim(),
    },
  });
  if (result.status !== 200) {
    throw new Error(`Fehler beim Testen der WordPress-Verbindung (HTTP ${result.status})`);
  }
  return result.body as WordPressConnectionTestResult;
}

export async function publishToWordPress(
  siteId: string,
  title: string,
  content: string,
  status: string
): Promise<WordPressPublishResult> {
  const client = getContractsClient();
  const result = await client.wordpress.publishPost({
    body: {
      siteId,
      title,
      content,
      // Contract schema: z.enum(['draft', 'publish', 'pending']).nullish()
      // Caller is responsible for passing a valid value; cast required because
      // the function signature accepts `string` for backward compatibility.
      status: status as 'draft' | 'publish' | 'pending',
    },
  });
  if (result.status !== 200) {
    throw new Error(`Fehler beim Veröffentlichen (HTTP ${result.status})`);
  }
  return {
    success: result.body.success,
    postId: (result.body.postId as number | null) ?? null,
    editUrl: result.body.editUrl ?? null,
    viewUrl: result.body.viewUrl ?? null,
    status: result.body.status ?? null,
  };
}

// NOT in contract — stays on raw apiClient
export async function fetchWordPressPosts(
  siteId: string,
  params?: { status?: string; search?: string; per_page?: number; page?: number }
): Promise<WordPressPost[]> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.set('status', params.status);
  if (params?.search) queryParams.set('search', params.search);
  if (params?.per_page) queryParams.set('per_page', String(params.per_page));
  if (params?.page) queryParams.set('page', String(params.page));

  const query = queryParams.toString();
  const url = `/wordpress/sites/${siteId}/posts${query ? `?${query}` : ''}`;
  const response = await apiClient.get<PostsResponse>(url);
  if (response.data?.success) {
    return response.data.posts ?? [];
  }
  throw new Error(response.data?.message ?? 'Fehler beim Laden der Beiträge');
}

// NOT in contract — stays on raw apiClient
export async function fetchWordPressCategories(siteId: string): Promise<WordPressCategory[]> {
  const response = await apiClient.get<CategoriesResponse>(`/wordpress/sites/${siteId}/categories`);
  if (response.data?.success) {
    return response.data.categories ?? [];
  }
  throw new Error(response.data?.message ?? 'Fehler beim Laden der Kategorien');
}
