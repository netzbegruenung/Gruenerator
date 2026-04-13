import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

import {
  wpSiteInfoSchema,
  wpUserResponseSchema,
  wpPostResponseSchema,
  wpPostSchema,
  wpCategorySchema,
  type WPPost,
  type WPCategory,
} from './schemas/wordpress.js';

export type { WPPost, WPCategory };

const log = createLogger('wordpress-api');

interface WPErrorResponse {
  message?: string;
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
  canPublish: boolean;
  siteName: string | null;
  siteDescription: string | null;
  error: string | null;
  errorCode: string | null;
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
    let parsed: URL;
    try {
      parsed = new URL(siteUrl.trim());
    } catch {
      throw new Error('Invalid WordPress site URL');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only HTTP(S) URLs are allowed for WordPress sites');
    }
    const normalizedUrl =
      `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`.replace(/\/+$/, '');

    const urlCheck = await validateUrlForFetch(normalizedUrl, {
      allowedProtocols: ['https:', 'http:'],
    });
    if (!urlCheck.isValid) {
      throw new Error(`WordPress URL failed SSRF validation: ${urlCheck.error}`);
    }

    const validatedBaseUrl = urlCheck.url!.href.replace(/\/+$/, '');

    const client = axios.create({
      baseURL: `${validatedBaseUrl}/wp-json`,
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
      siteUrl: validatedBaseUrl,
    });

    return new WordPressApiClient(validatedBaseUrl, client);
  }

  async testConnection(): Promise<ConnectionResult> {
    const fail = (error: string, errorCode: string): ConnectionResult => ({
      success: false,
      username: null,
      displayName: null,
      capabilities: [],
      canPublish: false,
      siteName: null,
      siteDescription: null,
      error,
      errorCode,
    });

    // Phase 1: Check if site is a WordPress site at all
    let siteName: string | null = null;
    let siteDescription: string | null = null;
    try {
      const siteInfoRaw = await this.client.get('/', { timeout: 10000 });
      const data = wpSiteInfoSchema.parse(siteInfoRaw.data);
      if (!data.namespaces?.includes('wp/v2')) {
        return fail(
          'Diese Seite scheint keine WordPress REST-API zu haben. Ist es eine WordPress-Seite?',
          'not_wordpress'
        );
      }
      siteName = data.name || null;
      siteDescription = data.description || null;
    } catch (error) {
      const err = error as AxiosError;
      if (!err.response) {
        return fail('WordPress-Seite nicht erreichbar. Bitte URL prüfen.', 'unreachable');
      }
      if (err.response.status === 404) {
        return fail(
          'WordPress REST-API nicht gefunden. Ist die REST-API aktiviert?',
          'no_rest_api'
        );
      }
    }

    // Phase 2: Verify credentials via users/me
    let capabilities: string[] = [];
    let username: string | null = null;
    let displayName: string | null = null;
    try {
      const userRaw = await this.client.get('/wp/v2/users/me', {
        params: { context: 'edit' },
      });

      const user = wpUserResponseSchema.parse(userRaw.data);
      capabilities = Object.keys(user.capabilities || {}).filter((key) => user.capabilities[key]);
      username = user.username || null;
      displayName = user.name || null;
    } catch (error) {
      const err = error as AxiosError;
      if (err.response?.status === 401) {
        return fail(
          'Anmeldedaten ungültig. Bitte Benutzername und Anwendungspasswort prüfen.',
          'invalid_credentials'
        );
      }
      if (err.response?.status === 403) {
        return fail('Zugriff verweigert. Hat dieser Account REST-API-Zugriff?', 'forbidden');
      }
      return fail(
        'Authentifizierung fehlgeschlagen: ' + (err.message || 'Unbekannter Fehler'),
        'auth_failed'
      );
    }

    // Phase 3: Check publish capability
    const canPublish = capabilities.includes('edit_posts');
    if (!canPublish) {
      return fail(
        `Angemeldet als "${displayName || username}", aber dieser Account hat keine Berechtigung zum Erstellen von Beiträgen. Mindestens die Rolle "Autor*in" ist erforderlich.`,
        'insufficient_permissions'
      );
    }

    // Phase 4: Write probe — create and immediately delete a draft to verify actual write access
    try {
      const probeRaw = await this.client.post('/wp/v2/posts', {
        title: '[Grünerator Verbindungstest]',
        content: '',
        status: 'draft',
      });
      const probeId = wpPostResponseSchema.parse(probeRaw.data).id;
      if (probeId) {
        try {
          await this.client.delete(`/wp/v2/posts/${probeId}`, {
            params: { force: true },
          });
        } catch {
          // Cleanup failure is non-critical — draft will remain but is harmless
          log.warn('Failed to clean up WordPress write probe post', { probeId });
        }
      }
    } catch (error) {
      const err = error as AxiosError;
      if (err.response?.status === 403) {
        return fail(
          'Berechtigungen reichen nicht aus, um Beiträge zu erstellen. Bitte WordPress-Rolle prüfen.',
          'write_denied'
        );
      }
      const errData = err.response?.data as WPErrorResponse | null;
      return fail(
        'Schreibtest fehlgeschlagen: ' + (errData?.message || err.message),
        'write_probe_failed'
      );
    }

    log.info('WordPress connection test successful', {
      siteUrl: this.siteUrl,
      username,
      siteName,
      canPublish: true,
    });

    return {
      success: true,
      username,
      displayName,
      capabilities,
      canPublish: true,
      siteName,
      siteDescription,
      error: null,
      errorCode: null,
    };
  }

  async createPost(
    title: string,
    content: string,
    options: CreatePostOptions = {}
  ): Promise<PostResult> {
    try {
      const postRaw = await this.client.post('/wp/v2/posts', {
        title,
        content,
        status: options.status || 'draft',
        excerpt: options.excerpt,
        categories: options.categories,
        tags: options.tags,
      });

      const post = wpPostResponseSchema.parse(postRaw.data);
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
      const putRaw = await this.client.put(`/wp/v2/posts/${postId}`, {
        title,
        content,
        status: options.status,
        excerpt: options.excerpt,
        categories: options.categories,
        tags: options.tags,
      });

      const post = wpPostResponseSchema.parse(putRaw.data);
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

      const totalPages = parseInt((response.headers['x-wp-totalpages'] as string) || '1', 10);
      const total = parseInt((response.headers['x-wp-total'] as string) || '0', 10);

      return {
        posts: z.array(wpPostSchema).parse(response.data),
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
      return wpPostSchema.parse(response.data);
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getCategories(): Promise<WPCategory[]> {
    try {
      const response = await this.client.get('/wp/v2/categories', {
        params: { per_page: 100 },
      });
      return z
        .array(wpCategorySchema)
        .parse(response.data)
        .map((cat) => ({
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
      if (error.response) {
        const status = error.response.status;
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
        const errData = error.response.data as WPErrorResponse | null;
        return new Error(errData?.message || error.message);
      }
      return new Error('WordPress-Seite nicht erreichbar');
    }

    return error instanceof Error ? error : new Error(String(error));
  }
}

export default WordPressApiClient;
