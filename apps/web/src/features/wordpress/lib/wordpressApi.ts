import apiClient from '@/components/utils/apiClient';

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

export async function fetchWordPressSites(): Promise<WordPressSite[]> {
  const response = await apiClient.get('/wordpress/sites');
  if (response.data?.success) {
    return response.data.sites || [];
  }
  throw new Error(response.data?.message || 'Fehler beim Laden der WordPress-Seiten');
}

export async function addWordPressSite(
  siteUrl: string,
  username: string,
  appPassword: string,
  label: string | null
): Promise<WordPressSite> {
  const response = await apiClient.post('/wordpress/sites', {
    siteUrl: siteUrl.trim(),
    username: username.trim(),
    appPassword: appPassword.trim(),
    ...(label?.trim() && { label: label.trim() }),
  });
  if (response.data?.success && response.data.site) {
    return response.data.site;
  }
  throw new Error(response.data?.message || 'Fehler beim Hinzufügen der WordPress-Seite');
}

export async function deleteWordPressSite(id: string): Promise<void> {
  const response = await apiClient.delete(`/wordpress/sites/${id}`);
  if (!response.data?.success) {
    throw new Error(response.data?.message || 'Fehler beim Löschen der WordPress-Seite');
  }
}

export async function testWordPressConnection(
  siteUrl: string,
  username: string,
  appPassword: string
): Promise<WordPressConnectionTestResult> {
  const response = await apiClient.post('/wordpress/test-connection', {
    siteUrl: siteUrl.trim(),
    username: username.trim(),
    appPassword: appPassword.trim(),
  });
  return response.data;
}

export async function publishToWordPress(
  siteId: string,
  title: string,
  content: string,
  status: string
): Promise<WordPressPublishResult> {
  const response = await apiClient.post('/wordpress/publish', {
    siteId,
    title,
    content,
    status,
  });
  if (response.data?.success) {
    return response.data;
  }
  throw new Error(response.data?.message || 'Fehler beim Veröffentlichen');
}

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
  const response = await apiClient.get(url);
  if (response.data?.success) {
    return response.data.posts || [];
  }
  throw new Error(response.data?.message || 'Fehler beim Laden der Beiträge');
}

export async function fetchWordPressCategories(siteId: string): Promise<WordPressCategory[]> {
  const response = await apiClient.get(`/wordpress/sites/${siteId}/categories`);
  if (response.data?.success) {
    return response.data.categories || [];
  }
  throw new Error(response.data?.message || 'Fehler beim Laden der Kategorien');
}
