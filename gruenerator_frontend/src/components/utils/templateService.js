import { handleError } from './errorHandling';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

// Helper function to generate public URL safely
const getPublicImageUrl = (relativePath) => {
  if (!relativePath) return null; // Return null if path is empty or null
  // For backend API, assume the URL is already public or handled by backend
  return relativePath.startsWith('http') ? relativePath : `${AUTH_BASE_URL}/api/templates/images/${relativePath}`;
};

export const templateService = {
  /**
   * Alle Templates mit zugehörigen Daten abrufen
   * @returns {Promise} - Promise mit den Templates
   */
  async getTemplates() {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/api/templates`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch templates' }));
        throw new Error(error.message || 'Fehler beim Abrufen der Templates');
      }
      
      const data = await response.json();
      
      // Transformiere die Daten in das im Frontend erwartete Format
      return data.map(template => {
        const images = template.canva_template_images || template.images
          ? (template.canva_template_images || template.images)
              .sort((a, b) => a.display_order - b.display_order)
              .map(img => ({
                ...img,
                // Generate the public URL from the relative path stored in img.url
                url: getPublicImageUrl(img.url) 
              }))
              // Filter out images where URL generation failed
              .filter(img => img.url !== null) 
          : [];

        // Extract category IDs from the join table structure
        const categories = template.template_to_categories || template.categories
          ? (template.template_to_categories || template.categories)
              .filter(jtc => jtc.template_categories || jtc.id) // Ensure the nested category object exists
              .map(jtc => jtc.template_categories?.id || jtc.id) // Map to the category ID
          : [];

        // Extract tag names using the correct table name 'template_tags'
        const tags = template.template_to_tags || template.tags
          ? (template.template_to_tags || template.tags)
              .filter(jtt => jtt.template_tags || jtt.name) // Check for the nested 'template_tags' object
              .map(jtt => jtt.template_tags?.name || jtt.name) // Map to the name within 'template_tags'
          : [];

        return {
          ...template,
          images: images,
          category: categories, // Use the extracted category IDs
          tags: tags,           // Use the extracted tag names
          canvaUrl: template.canvaurl || template.canva_url // Ensure canvaUrl field name matches the database column name
        };
      });
    } catch (error) {
      handleError(error, 'Fehler beim Abrufen der Templates');
      return [];
    }
  },
  
  /**
   * Templates nach Kategorie filtern
   * @param {string} categoryId - ID der Kategorie
   * @returns {Promise} - Promise mit gefilterten Templates
   */
  async getTemplatesByCategory(categoryId) {
    try {
      const url = new URL(`${AUTH_BASE_URL}/api/templates`);
      if (categoryId) {
        url.searchParams.append('categoryId', categoryId);
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch templates by category' }));
        throw new Error(error.message || 'Fehler beim Filtern der Templates nach Kategorie');
      }
      
      const data = await response.json();
      
      // Transform data (similar to getTemplates)
      return data.map(template => {
         const images = template.canva_template_images || template.images
          ? (template.canva_template_images || template.images)
              .sort((a, b) => a.display_order - b.display_order)
              .map(img => ({
                ...img,
                url: getPublicImageUrl(img.url)
              }))
              .filter(img => img.url !== null)
          : [];
        
        const categories = template.template_to_categories || template.categories
          ? (template.template_to_categories || template.categories)
              .filter(jtc => jtc.template_categories || jtc.id)
              .map(jtc => jtc.template_categories?.id || jtc.id)
          : [];

        // Extract tag names using the correct table name 'template_tags'
        const tags = template.template_to_tags || template.tags
          ? (template.template_to_tags || template.tags)
              .filter(jtt => jtt.template_tags || jtt.name) // Check for the nested 'template_tags' object
              .map(jtt => jtt.template_tags?.name || jtt.name) // Map to the name within 'template_tags'
          : [];

        return {
          ...template,
          images: images,
          category: categories, 
          tags: tags,
          canvaUrl: template.canvaurl || template.canva_url
        };
      });
    } catch (error) {
      handleError(error, 'Fehler beim Filtern der Templates nach Kategorie');
      return [];
    }
  },
  
  /**
   * Alle Kategorien abrufen
   * @returns {Promise} - Promise mit den Kategorien
   */
  async getCategories() {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/api/templates/categories`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch categories' }));
        throw new Error(error.message || 'Fehler beim Abrufen der Kategorien');
      }
        
      const data = await response.json();
      return data || []; // Return fetched data or an empty array

    } catch (error) {
      handleError(error, 'Fehler beim Abrufen der Kategorien');
      return [];
    }
  }
}; 