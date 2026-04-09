import crypto from 'node:crypto';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../logger.js';
import { encryptCredential } from '../../validation/encryption.js';

import {
  type WordPressSite,
  type WordPressSitePublic,
  type WordPressSiteValidation,
  type WordPressSiteUpdates,
  type WordPressSiteDeletionResult,
} from './types.js';

const logger = createLogger('wordpress');

export class WordPressSiteManager {
  private static async getPostgres() {
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    return postgres;
  }

  private static async getSitesArray(userId: string): Promise<WordPressSite[]> {
    const postgres = await this.getPostgres();
    const profile = await postgres.queryOne(
      'SELECT wordpress_sites FROM profiles WHERE id = $1',
      [userId],
      { table: 'profiles' }
    );
    const raw = profile?.wordpress_sites;
    return Array.isArray(raw) ? raw : [];
  }

  private static async saveSitesArray(userId: string, sites: WordPressSite[]): Promise<void> {
    const postgres = await this.getPostgres();
    const result = await postgres.update(
      'profiles',
      { wordpress_sites: JSON.stringify(sites) },
      { id: userId }
    );
    if (!result.data || result.data.length === 0) {
      throw new Error('Profile not found');
    }
  }

  static validateSiteUrl(siteUrl: string): WordPressSiteValidation {
    if (!siteUrl || typeof siteUrl !== 'string') {
      return { isValid: false, normalizedUrl: null, error: 'Site URL is required' };
    }

    let urlObj: URL;
    try {
      urlObj = new URL(siteUrl);
    } catch {
      return { isValid: false, normalizedUrl: null, error: 'Invalid URL format' };
    }

    if (urlObj.protocol !== 'https:') {
      return { isValid: false, normalizedUrl: null, error: 'Only HTTPS URLs are supported' };
    }

    const normalizedUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.replace(/\/+$/, '')}`;

    return { isValid: true, normalizedUrl, error: null };
  }

  static async saveSite(
    userId: string,
    siteUrl: string,
    username: string,
    appPassword: string,
    label: string = ''
  ): Promise<WordPressSitePublic> {
    try {
      logger.info('Saving WordPress site', { userId, label });

      if (!userId) throw new Error('User ID is required');
      if (!siteUrl) throw new Error('Site URL is required');
      if (!username) throw new Error('Username is required');
      if (!appPassword) throw new Error('Application password is required');

      const validation = this.validateSiteUrl(siteUrl);
      if (!validation.isValid || !validation.normalizedUrl) {
        throw new Error(validation.error ?? 'Invalid site URL');
      }

      const currentSites = await this.getSitesArray(userId);

      const existingSite = currentSites.find(
        (site: WordPressSite) =>
          site.site_url === validation.normalizedUrl && site.username === username
      );
      if (existingSite) {
        throw new Error('A site with this URL and username is already saved');
      }

      const newSite: WordPressSite = {
        id: crypto.randomUUID(),
        label: label || null,
        site_url: validation.normalizedUrl,
        username,
        app_password_encrypted: encryptCredential(appPassword),
        is_active: true,
        created_at: new Date().toISOString(),
        last_used_at: null,
        last_error: null,
      };

      await this.saveSitesArray(userId, [...currentSites, newSite]);

      logger.info('WordPress site saved successfully', { siteId: newSite.id });

      return this.toPublic(newSite);
    } catch (error) {
      logger.error('Error in saveSite', { error: (error as Error).message });
      throw error;
    }
  }

  static async getSites(userId: string): Promise<WordPressSitePublic[]> {
    try {
      logger.debug('Getting WordPress sites for user', { userId });

      if (!userId) throw new Error('User ID is required');

      const sites = await this.getSitesArray(userId);

      const sortedSites = sites.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      logger.debug('Retrieved WordPress sites', { userId, count: sortedSites.length });

      return sortedSites.map((site) => this.toPublic(site));
    } catch (error) {
      logger.error('Error in getSites', { error: (error as Error).message });
      throw error;
    }
  }

  static async getSiteById(userId: string, siteId: string): Promise<WordPressSite> {
    try {
      logger.debug('Getting WordPress site by ID', { userId, siteId });

      if (!userId || !siteId) throw new Error('User ID and site ID are required');

      const sites = await this.getSitesArray(userId);
      const site = sites.find((s: WordPressSite) => s.id === siteId);

      if (!site) throw new Error('WordPress site not found');

      return site;
    } catch (error) {
      logger.error('Error in getSiteById', { error: (error as Error).message });
      throw error;
    }
  }

  static async updateSite(
    userId: string,
    siteId: string,
    updates: WordPressSiteUpdates
  ): Promise<WordPressSitePublic> {
    try {
      logger.info('Updating WordPress site', { userId, siteId });

      if (!userId || !siteId) throw new Error('User ID and site ID are required');

      const currentSites = await this.getSitesArray(userId);
      const siteIndex = currentSites.findIndex((s: WordPressSite) => s.id === siteId);

      if (siteIndex === -1) throw new Error('WordPress site not found');

      const { app_password, ...restUpdates } = updates;

      const originalSite = currentSites[siteIndex];
      const updatedSite: WordPressSite = {
        ...originalSite,
        label: restUpdates.label != null ? restUpdates.label : originalSite.label,
        is_active: restUpdates.is_active != null ? restUpdates.is_active : originalSite.is_active,
        username: restUpdates.username != null ? restUpdates.username : originalSite.username,
        updated_at: new Date().toISOString(),
      };

      if (app_password) {
        updatedSite.app_password_encrypted = encryptCredential(app_password);
      }

      currentSites[siteIndex] = updatedSite;
      await this.saveSitesArray(userId, currentSites);

      logger.info('WordPress site updated successfully', { siteId });

      return this.toPublic(updatedSite);
    } catch (error) {
      logger.error('Error in updateSite', { error: (error as Error).message });
      throw error;
    }
  }

  static async deleteSite(userId: string, siteId: string): Promise<WordPressSiteDeletionResult> {
    try {
      logger.info('Deleting WordPress site', { userId, siteId });

      if (!userId || !siteId) throw new Error('User ID and site ID are required');

      const currentSites = await this.getSitesArray(userId);
      const siteToDelete = currentSites.find((s: WordPressSite) => s.id === siteId);

      if (!siteToDelete) throw new Error('WordPress site not found');

      await this.saveSitesArray(
        userId,
        currentSites.filter((s: WordPressSite) => s.id !== siteId)
      );

      logger.info('WordPress site deleted successfully', { siteId });

      return { success: true, deletedId: siteId };
    } catch (error) {
      logger.error('Error in deleteSite', { error: (error as Error).message });
      throw error;
    }
  }

  static async updateLastUsed(userId: string, siteId: string): Promise<void> {
    try {
      await this.patchSiteField(userId, siteId, { last_used_at: new Date().toISOString() });
    } catch (error) {
      logger.error('Error in updateLastUsed', { error: (error as Error).message });
    }
  }

  static async updateLastError(
    userId: string,
    siteId: string,
    error: string | null
  ): Promise<void> {
    try {
      await this.patchSiteField(userId, siteId, { last_error: error });
    } catch (error_) {
      logger.error('Error in updateLastError', { error: (error_ as Error).message });
    }
  }

  private static async patchSiteField(
    userId: string,
    siteId: string,
    patch: Partial<WordPressSite>
  ): Promise<void> {
    const sites = await this.getSitesArray(userId);
    const siteIndex = sites.findIndex((s: WordPressSite) => s.id === siteId);
    if (siteIndex === -1) return;

    sites[siteIndex] = { ...sites[siteIndex], ...patch };
    await this.saveSitesArray(userId, sites);
  }

  private static toPublic(site: WordPressSite): WordPressSitePublic {
    return {
      id: site.id,
      label: site.label,
      site_url: site.site_url,
      username: site.username,
      has_credentials: Boolean(site.app_password_encrypted),
      is_active: site.is_active,
      created_at: site.created_at,
      last_used_at: site.last_used_at,
      last_error: site.last_error,
    };
  }
}

export default WordPressSiteManager;
