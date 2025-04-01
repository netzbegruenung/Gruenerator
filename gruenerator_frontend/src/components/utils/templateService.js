import { templatesSupabase, templatesSupabaseUtils } from './templatesSupabaseClient';
import { handleError } from './errorHandling';

// Define the bucket name here for reuse
const imageBucketName = 'templateimages';

// Helper function to generate public URL safely
const getPublicImageUrl = (relativePath) => {
  if (!relativePath) return null; // Return null if path is empty or null
  try {
    const { data } = templatesSupabase.storage.from(imageBucketName).getPublicUrl(relativePath);
    // Check if data exists and has publicUrl property
    return data?.publicUrl || null; 
  } catch (error) {
    console.error(`Error generating public URL for ${relativePath}:`, error);
    return null; // Return null on error
  }
};

export const templateService = {
  /**
   * Alle Templates mit zugehörigen Daten abrufen
   * @returns {Promise} - Promise mit den Templates
   */
  async getTemplates() {
    try {
      const { data, error } = await templatesSupabase
        .from('templates')
        .select(`
          *, 
          template_images(
            id, url, alt, display_order 
          ),
          template_categories (
            categories (
              id
            )
          ),
          template_tags (
            tags (
              name
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transformiere die Daten in das im Frontend erwartete Format
      return data.map(template => {
        const images = template.template_images 
          ? template.template_images
              .sort((a, b) => a.display_order - b.display_order)
              .map(img => ({
                ...img,
                // Generate the public URL from the relative path stored in img.url
                url: getPublicImageUrl(img.url) 
              }))
              // Filter out images where URL generation failed
              .filter(img => img.url !== null) 
          : [];

        return {
          ...template,
          images: images,
          category: template.template_categories ? template.template_categories.map(tc => tc.categories.id) : [],
          tags: template.template_tags ? template.template_tags.map(tt => tt.tags.name) : [],
          canvaUrl: template.canvaurl // Ensure canvaUrl field name matches the database column name
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
      const { data, error } = await templatesSupabase
        .from('template_categories')
        .select(`
          templates (
            *,
            template_images (
              id, url, alt, display_order
            ),
            template_categories (
              categories (
                id,
                label
              )
            ),
            template_tags (
              tags (
                name
              )
            )
          )
        `)
        .eq('category_id', categoryId);
      
      if (error) throw error;
      
      // Flache die Daten ab und transformiere sie
      const templates = data.map(item => item.templates).filter(Boolean); // Filter out null/undefined templates if any
      return templates.map(template => {
         const images = template.template_images 
          ? template.template_images
              .sort((a, b) => a.display_order - b.display_order)
              .map(img => ({
                ...img,
                // Generate the public URL from the relative path stored in img.url
                url: getPublicImageUrl(img.url)
              }))
              // Filter out images where URL generation failed
              .filter(img => img.url !== null)
          : [];

        return {
          ...template,
          images: images,
          category: template.template_categories ? template.template_categories.map(tc => tc.categories.id) : [],
          tags: template.template_tags ? template.template_tags.map(tt => tt.tags.name) : [],
          canvaUrl: template.canvaurl // Ensure canvaUrl field name matches the database column name
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
      // Assuming categories table has 'id' and 'label' fields
      const { data, error } = await templatesSupabase
        .from('categories')
        .select('id, label') 
        .order('label', { ascending: true }); // Optional: order categories alphabetically
        
      if (error) throw error;
      return data || []; // Return fetched data or an empty array

    } catch (error) {
      handleError(error, 'Fehler beim Abrufen der Kategorien');
      return [];
    }
  }
}; 