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
        .from('canva_templates')
        .select(`
          *, 
          canva_template_images!canva_template_images_template_id_fkey(
            id, url, alt, display_order 
          ),
          template_to_categories!inner(
            category_id,
            template_categories (
              id,
              label
            )
          ),
          template_to_tags!inner(
            tag_id,
            template_tags (
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transformiere die Daten in das im Frontend erwartete Format
      return data.map(template => {
        const images = template.canva_template_images 
          ? template.canva_template_images
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
        const categories = template.template_to_categories
          ? template.template_to_categories
              .filter(jtc => jtc.template_categories) // Ensure the nested category object exists
              .map(jtc => jtc.template_categories.id) // Map to the category ID
          : [];

        // Extract tag names using the correct table name 'template_tags'
        const tags = template.template_to_tags
          ? template.template_to_tags
              .filter(jtt => jtt.template_tags) // Check for the nested 'template_tags' object
              .map(jtt => jtt.template_tags.name) // Map to the name within 'template_tags'
          : [];

        return {
          ...template,
          images: images,
          category: categories, // Use the extracted category IDs
          tags: tags,           // Use the extracted tag names
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
        .from('canva_templates')
        .select(`
          *,
          canva_template_images!canva_template_images_template_id_fkey(id, url, alt, display_order),
          template_to_categories!inner(
            category_id, 
            template_categories(id, label)
          ),
          template_to_tags!inner(
            tag_id, 
            template_tags(id, name) // Use the correct table name 'template_tags'
          )
        `)
        .eq('template_to_categories.category_id', categoryId) 
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform data (similar to getTemplates)
      return data.map(template => {
         const images = template.canva_template_images
          ? template.canva_template_images
              .sort((a, b) => a.display_order - b.display_order)
              .map(img => ({
                ...img,
                url: getPublicImageUrl(img.url)
              }))
              .filter(img => img.url !== null)
          : [];
        
        const categories = template.template_to_categories
          ? template.template_to_categories
              .filter(jtc => jtc.template_categories)
              .map(jtc => jtc.template_categories.id)
          : [];

        // Extract tag names using the correct table name 'template_tags'
        const tags = template.template_to_tags
          ? template.template_to_tags
              .filter(jtt => jtt.template_tags) // Check for the nested 'template_tags' object
              .map(jtt => jtt.template_tags.name) // Map to the name within 'template_tags'
          : [];

        return {
          ...template,
          images: images,
          category: categories, 
          tags: tags,
          canvaUrl: template.canvaurl 
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
        .from('template_categories')
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