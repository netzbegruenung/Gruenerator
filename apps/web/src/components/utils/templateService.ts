import apiClient from './apiClient';
import { handleError } from './errorHandling';

// Auth Backend URL - only needed for image URL generation
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

interface TemplateImage {
  url: string | null;
  display_order: number;
  [key: string]: unknown;
}

interface TemplateCategory {
  id: string;
  [key: string]: unknown;
}

interface TemplateTag {
  name: string;
  [key: string]: unknown;
}

interface TemplateToCategoryJoin {
  template_categories?: TemplateCategory;
  id?: string;
  [key: string]: unknown;
}

interface TemplateToTagJoin {
  template_tags?: TemplateTag;
  name?: string;
  [key: string]: unknown;
}

interface RawTemplate {
  canva_template_images?: TemplateImage[];
  images?: TemplateImage[];
  template_to_categories?: TemplateToCategoryJoin[];
  categories?: TemplateToCategoryJoin[];
  template_to_tags?: TemplateToTagJoin[];
  tags?: TemplateToTagJoin[];
  canvaurl?: string;
  canva_url?: string;
  [key: string]: unknown;
}

interface TransformedTemplate extends RawTemplate {
  images: TemplateImage[];
  category: string[];
  tags: string[];
  canvaUrl?: string;
}

interface UserTemplateData {
  [key: string]: unknown;
}

interface UserTemplateMetadata {
  [key: string]: unknown;
}

// Helper function to generate public URL safely
const getPublicImageUrl = (relativePath: string | null | undefined): string | null => {
  if (!relativePath) return null; // Return null if path is empty or null
  // For backend API, assume the URL is already public or handled by backend
  return relativePath.startsWith('http')
    ? relativePath
    : `${AUTH_BASE_URL}/api/templates/images/${relativePath}`;
};

const transformTemplate = (template: RawTemplate): TransformedTemplate => {
  const images =
    template.canva_template_images || template.images
      ? (template.canva_template_images || template.images)!
          .sort((a, b) => a.display_order - b.display_order)
          .map((img) => ({
            ...img,
            // Generate the public URL from the relative path stored in img.url
            url: getPublicImageUrl(img.url),
          }))
          // Filter out images where URL generation failed
          .filter((img) => img.url !== null)
      : [];

  // Extract category IDs from the join table structure
  const categories =
    template.template_to_categories || template.categories
      ? (template.template_to_categories || template.categories)!
          .filter((jtc) => jtc.template_categories || jtc.id) // Ensure the nested category object exists
          .map((jtc) => (jtc.template_categories?.id || jtc.id) as string) // Map to the category ID
      : [];

  // Extract tag names using the correct table name 'template_tags'
  const tags =
    template.template_to_tags || template.tags
      ? (template.template_to_tags || template.tags)!
          .filter((jtt) => jtt.template_tags || jtt.name) // Check for the nested 'template_tags' object
          .map((jtt) => (jtt.template_tags?.name || jtt.name) as string) // Map to the name within 'template_tags'
      : [];

  return {
    ...template,
    images: images as TemplateImage[],
    category: categories, // Use the extracted category IDs
    tags: tags, // Use the extracted tag names
    canvaUrl: template.canvaurl || template.canva_url, // Ensure canvaUrl field name matches the database column name
  };
};

export const templateService = {
  /**
   * Alle öffentlichen Templates mit zugehörigen Daten abrufen (für Galerie)
   * @returns Promise mit den Templates
   */
  async getPublicTemplates(): Promise<TransformedTemplate[]> {
    try {
      const response = await apiClient.get('/api/templates');
      const data: RawTemplate[] = response.data;

      // Transformiere die Daten in das im Frontend erwartete Format
      return data.map(transformTemplate);
    } catch (error) {
      handleError(error, 'Fehler beim Abrufen der Templates');
      return [];
    }
  },

  /**
   * Templates nach Kategorie filtern
   * @param categoryId - ID der Kategorie
   * @returns Promise mit gefilterten Templates
   */
  async getTemplatesByCategory(categoryId: string): Promise<TransformedTemplate[]> {
    try {
      const params: Record<string, string> = {};
      if (categoryId) {
        params.categoryId = categoryId;
      }

      const response = await apiClient.get('/api/templates', { params });
      const data: RawTemplate[] = response.data;

      // Transform data (similar to getTemplates)
      return data.map(transformTemplate);
    } catch (error) {
      handleError(error, 'Fehler beim Filtern der Templates nach Kategorie');
      return [];
    }
  },

  /**
   * Alle Kategorien abrufen
   * @returns Promise mit den Kategorien
   */
  async getCategories(): Promise<TemplateCategory[]> {
    try {
      const response = await apiClient.get('/api/templates/categories');
      const data = response.data;
      return data || []; // Return fetched data or an empty array
    } catch (error) {
      handleError(error, 'Fehler beim Abrufen der Kategorien');
      return [];
    }
  },

  /**
   * Benutzer-Templates abrufen
   * @returns Promise mit den Benutzer-Templates
   */
  async getUserTemplates(): Promise<unknown[]> {
    try {
      const response = await apiClient.get('/auth/user-templates');
      const data = response.data;
      return data.success ? data.data : [];
    } catch (error) {
      handleError(error, 'Fehler beim Abrufen der Benutzer-Templates');
      return [];
    }
  },

  /**
   * Neues Benutzer-Template erstellen
   * @param templateData - Template-Daten
   * @returns Promise mit dem erstellten Template
   */
  async createUserTemplate(templateData: UserTemplateData): Promise<unknown> {
    try {
      const response = await apiClient.post('/auth/user-templates', templateData);
      return response.data;
    } catch (error) {
      handleError(error, 'Fehler beim Erstellen des Templates');
      throw error;
    }
  },

  /**
   * Benutzer-Template aktualisieren
   * @param templateId - Template ID
   * @param templateData - Template-Daten
   * @returns Promise mit dem aktualisierten Template
   */
  async updateUserTemplate(templateId: string, templateData: UserTemplateData): Promise<unknown> {
    try {
      const response = await apiClient.put(`/auth/user-templates/${templateId}`, templateData);
      return response.data;
    } catch (error) {
      handleError(error, 'Fehler beim Aktualisieren des Templates');
      throw error;
    }
  },

  /**
   * Benutzer-Template löschen
   * @param templateId - Template ID
   * @returns Promise mit dem Löschstatus
   */
  async deleteUserTemplate(templateId: string): Promise<unknown> {
    try {
      const response = await apiClient.delete(`/auth/user-templates/${templateId}`);
      return response.data;
    } catch (error) {
      handleError(error, 'Fehler beim Löschen des Templates');
      throw error;
    }
  },

  /**
   * Template-Metadaten aktualisieren (z.B. Titel)
   * @param templateId - Template ID
   * @param metadata - Metadaten
   * @returns Promise mit dem Update-Status
   */
  async updateUserTemplateMetadata(
    templateId: string,
    metadata: UserTemplateMetadata
  ): Promise<unknown> {
    try {
      const response = await apiClient.post(
        `/auth/user-templates/${templateId}/metadata`,
        metadata
      );
      return response.data;
    } catch (error) {
      handleError(error, 'Fehler beim Aktualisieren der Template-Metadaten');
      throw error;
    }
  },

  /**
   * Canva Template aus URL erstellen
   * @param url - Canva URL
   * @param enhancedMetadata - Whether to extract enhanced metadata (preview image, dimensions, etc.)
   * @returns Promise mit dem erstellten Template
   */
  async createUserTemplateFromUrl(url: string, enhancedMetadata = false): Promise<unknown> {
    try {
      const response = await apiClient.post('/auth/user-templates/from-url', {
        url,
        enhancedMetadata,
      });
      return response.data;
    } catch (error) {
      console.error('[templateService] Error creating template from URL:', error);
      throw error;
    }
  },
};
