import * as Y from 'yjs';
import pako from 'pako';
import { supabaseService } from '../utils/supabaseClient.js';

const RETENTION_DAYS = 30; // Keep versions for 30 days

export class DailyVersionService {
  /**
   * Check if a daily version exists for today and create one if needed
   * @param {string} documentId - The document ID (UUID or string)
   * @param {Y.Doc} ydoc - The Y.js document
   * @param {string} userId - The user ID who opened the document
   * @returns {Promise<boolean>} True if a version was created, false if one already existed
   */
  static async ensureDailyVersion(documentId, ydoc, userId = null) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    try {
      // Check if today's version already exists
      const { data: existingVersion, error: checkError } = await supabaseService
        .from('document_daily_versions')
        .select('id')
        .eq('document_id', documentId)
        .eq('version_date', today)
        .maybeSingle();

      if (checkError) {
        console.error(`[DailyVersionService] Error checking existing version for ${documentId}:`, checkError);
        return false;
      }

      if (existingVersion) {
        console.log(`[DailyVersionService] Daily version already exists for ${documentId} on ${today}`);
        return false;
      }

      // Create today's version
      const success = await this.createDailyVersion(documentId, ydoc, today, userId);
      
      if (success) {
        console.log(`[DailyVersionService] Created daily version for ${documentId} on ${today}`);
        // Cleanup old versions in background
        this.cleanupOldVersions(documentId).catch(err => 
          console.error(`[DailyVersionService] Error cleaning up old versions for ${documentId}:`, err)
        );
      }
      
      return success;
    } catch (error) {
      console.error(`[DailyVersionService] Exception in ensureDailyVersion for ${documentId}:`, error);
      return false;
    }
  }

  /**
   * Create a daily version snapshot
   * @param {string} documentId - The document ID
   * @param {Y.Doc} ydoc - The Y.js document
   * @param {string} versionDate - The version date (YYYY-MM-DD)
   * @param {string} userId - The user ID
   * @returns {Promise<boolean>} Success status
   */
  static async createDailyVersion(documentId, ydoc, versionDate, userId = null) {
    try {
      // Get current document state
      const documentState = Y.encodeStateAsUpdate(ydoc);
      const compressedState = pako.deflate(documentState);

      // Insert into database
      const { error } = await supabaseService
        .from('document_daily_versions')
        .insert([{
          document_id: documentId,
          version_date: versionDate,
          snapshot_data: compressedState,
          created_by: userId
        }]);

      if (error) {
        console.error(`[DailyVersionService] Error creating daily version:`, error);
        return false;
      }

      console.log(`[DailyVersionService] Successfully created daily version for ${documentId} on ${versionDate}`);
      return true;
    } catch (error) {
      console.error(`[DailyVersionService] Exception creating daily version:`, error);
      return false;
    }
  }

  /**
   * Get daily versions for a document
   * @param {string} documentId - The document ID
   * @param {number} limit - Maximum number of versions to return
   * @returns {Promise<Array>} Array of version objects
   */
  static async getDailyVersions(documentId, limit = 30) {
    try {
      const { data, error } = await supabaseService
        .from('document_daily_versions')
        .select('id, version_date, created_by, created_at')
        .eq('document_id', documentId)
        .order('version_date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error(`[DailyVersionService] Error fetching daily versions for ${documentId}:`, error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error(`[DailyVersionService] Exception fetching daily versions for ${documentId}:`, error);
      return [];
    }
  }

  /**
   * Get a specific daily version
   * @param {string} documentId - The document ID
   * @param {string} versionDate - The version date (YYYY-MM-DD)
   * @returns {Promise<Object|null>} Version object with snapshot data or null
   */
  static async getDailyVersion(documentId, versionDate) {
    try {
      const { data, error } = await supabaseService
        .from('document_daily_versions')
        .select('*')
        .eq('document_id', documentId)
        .eq('version_date', versionDate)
        .maybeSingle();

      if (error) {
        console.error(`[DailyVersionService] Error fetching daily version for ${documentId} on ${versionDate}:`, error);
        return null;
      }

      return data;
    } catch (error) {
      console.error(`[DailyVersionService] Exception fetching daily version for ${documentId} on ${versionDate}:`, error);
      return null;
    }
  }

  /**
   * Restore a Y.js document from a daily version
   * @param {string} documentId - The document ID
   * @param {string} versionDate - The version date (YYYY-MM-DD)
   * @returns {Promise<Y.Doc|null>} Restored Y.js document or null
   */
  static async restoreFromDailyVersion(documentId, versionDate) {
    try {
      const versionData = await this.getDailyVersion(documentId, versionDate);
      
      if (!versionData || !versionData.snapshot_data) {
        console.warn(`[DailyVersionService] No snapshot data found for ${documentId} on ${versionDate}`);
        return null;
      }

      // Create new Y.js document
      const ydoc = new Y.Doc();
      
      // Decompress and apply the snapshot
      const decompressedSnapshot = pako.inflate(versionData.snapshot_data);
      Y.applyUpdate(ydoc, decompressedSnapshot);

      console.log(`[DailyVersionService] Successfully restored document ${documentId} from version ${versionDate}`);
      return ydoc;
    } catch (error) {
      console.error(`[DailyVersionService] Exception restoring daily version for ${documentId} on ${versionDate}:`, error);
      return null;
    }
  }

  /**
   * Clean up old versions beyond retention period
   * @param {string} documentId - The document ID
   * @returns {Promise<void>}
   */
  static async cleanupOldVersions(documentId) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      const { data, error } = await supabaseService
        .from('document_daily_versions')
        .delete()
        .eq('document_id', documentId)
        .lt('version_date', cutoffDateStr);

      if (error) {
        console.error(`[DailyVersionService] Error cleaning up old versions for ${documentId}:`, error);
        return;
      }

      if (data && data.length > 0) {
        console.log(`[DailyVersionService] Cleaned up ${data.length} old versions for ${documentId}`);
      }
    } catch (error) {
      console.error(`[DailyVersionService] Exception cleaning up old versions for ${documentId}:`, error);
    }
  }

  /**
   * Get document content as HTML from a daily version
   * @param {string} documentId - The document ID
   * @param {string} versionDate - The version date (YYYY-MM-DD)
   * @returns {Promise<string|null>} HTML content or null
   */
  static async getVersionContentAsHtml(documentId, versionDate) {
    try {
      const ydoc = await this.restoreFromDailyVersion(documentId, versionDate);
      if (!ydoc) return null;

      const ytext = ydoc.getText('quill');
      // Convert Y.js text to HTML using Quill
      const { createQuill } = await import('../../utils/quillHelper.js');
      const quill = createQuill();
      
      // Apply Y.js text content to Quill
      quill.setContents(ytext.toDelta());
      
      // Get HTML content
      const htmlContent = quill.root.innerHTML;
      
      // Clean up
      ydoc.destroy();
      
      return htmlContent;
    } catch (error) {
      console.error(`[DailyVersionService] Exception getting version content as HTML:`, error);
      return null;
    }
  }
}