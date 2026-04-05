import axios, { type AxiosInstance, type AxiosError } from 'axios';

import { createLogger } from '../../utils/logger.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

const log = createLogger('wordpress-api');

export interface WPPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  status: string;
  date: string;
  link: string;
  categories: number[];
  tags: number[];
}

export interface WPCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface CreatePostOptions {
  status?: 'draft' | 'publish' | 'pending';
  excerpt?: string;
  categories?: number[];
  tags?: number[];
}

export interface PostResult {
  id: number;
  editUrl: string;
  viewUrl: string;
  status: string;
}

export interface ConnectionResult {
  success: boolean;
  username: string | null;
  displayName: string | null;
  capabilities: string[];
  error: string | null;
}

export interface PostsListResult {
  posts: WPPost[];
  totalPages: number;
  total: number;
}

export interface GetPostsParams {
  status?: string;
  search?: string;
  per_page?: number;
  page?: number;
  categories?: number[];
}

class WordPressApiClient {
  private siteUrl: string;
  private client: AxiosInstance;

  private constructor(siteUrl: string, client: AxiosInstance) {
    this.siteUrl = siteUrl;
    this.client = client;
  }

  static async create(
    siteUrl: string,
    username: string,
    appPassword: string
  ): Promise<WordPressApiClient> {
    const normalizedUrl = siteUrl.replace(/\/+$/, '');

    const urlCheck = await validateUrlForFetch(normalizedUrl, {
      allowedProtocols: ['https:', 'http:'],
    });
    if (!urlCheck.isValid) {
      throw new Error(`WordPress URL failed SSRF validation: ${urlCheck.error}`);
    }

    const client = axios.create({
      baseURL: `${normalizedUrl}/wp-json`,
      auth: { username, password: appPassword },
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    client.interceptors.response.use(
      (response) => response,
      (error) => {
        log.error('WordPress API error', {
          status: (error as AxiosError).response?.status,
          url: (error as AxiosError).config?.url,
          message: (error as AxiosError).message,
        });
        return Promise.reject(error);
      }
    );

    log.info('WordPressApiClient initialized', {
      siteUrl: normalizedUrl,
    });

    return new WordPressApiClient(normalizedUrl, client);
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      const response = await this.client.get('/wp/v2/users/me', {
        params: { context: 'edit' },
      });

      const user = response.data;
      const capabilities = Object.keys(user.capabilities || {}).filter(
        (key: string) => user.capabilities[key]
      );

      return {
        success: true,
        username: user.username || null,
        displayName: user.name || null,
        capabilities,
        error: null,
      };
    } catch (error) {
      const normalized = this.normalizeError(error);
      return {
        success: false,
        username: null,
        displayName: null,
        capabilities: [],
        error: normalized.message,
      };
    }
  }

  async createPost(
    title: string,
    content: string,
    options: CreatePostOptions = {}
  ): Promise<PostResult> {
    try {
      const response = await this.client.post('/wp/v2/posts', {
        title,
        content,
        status: options.status || 'draft',
        excerpt: options.excerpt,
        categories: options.categories,
        tags: options.tags,
      });

      const post = response.data;
      return {
        id: post.id,
        editUrl: `${this.siteUrl}/wp-admin/post.php?post=${post.id}&action=edit`,
        viewUrl: post.link,
        status: post.status,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async updatePost(
    postId: number,
    title: string,
    content: string,
    options: CreatePostOptions = {}
  ): Promise<PostResult> {
    try {
      const response = await this.client.put(`/wp/v2/posts/${postId}`, {
        title,
        content,
        status: options.status,
        excerpt: options.excerpt,
        categories: options.categories,
        tags: options.tags,
      });

      const post = response.data;
      return {
        id: post.id,
        editUrl: `${this.siteUrl}/wp-admin/post.php?post=${post.id}&action=edit`,
        viewUrl: post.link,
        status: post.status,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getPosts(params: GetPostsParams = {}): Promise<PostsListResult> {
    try {
      const response = await this.client.get('/wp/v2/posts', { params });

      const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);
      const total = parseInt(response.headers['x-wp-total'] || '0', 10);

      return {
        posts: response.data,
        totalPages,
        total,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getPost(postId: number): Promise<WPPost> {
    try {
      const response = await this.client.get(`/wp/v2/posts/${postId}`);
      return response.data;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getCategories(): Promise<WPCategory[]> {
    try {
      const response = await this.client.get('/wp/v2/categories', {
        params: { per_page: 100 },
      });
      return response.data.map((cat: Record<string, unknown>) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        count: cat.count,
      }));
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private normalizeError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError;

      if (axiosErr.response) {
        const status = axiosErr.response.status;
        if (status === 401) {
          return new Error('Anmeldedaten ungültig. Bitte Anwendungspasswort prüfen.');
        }
        if (status === 403) {
          return new Error('Keine Berechtigung zum Erstellen von Beiträgen');
        }
        if (status === 404) {
          return new Error('WordPress REST-API nicht gefunden. Ist die REST-API aktiviert?');
        }
        if (status >= 500) {
          return new Error('WordPress-Server-Fehler');
        }
        return new Error(
          (axiosErr.response.data as { message?: string })?.message || axiosErr.message
        );
      }

      return new Error('WordPress-Seite nicht erreichbar');
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
  }
}

export default WordPressApiClient;
