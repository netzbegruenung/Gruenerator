import { templatesSupabase, templatesSupabaseUtils } from './templatesSupabaseClient';
import { handleError } from './errorHandling';

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
          template_images (
            url,
            alt,
            display_order
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
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transformiere die Daten in das im Frontend erwartete Format
      return data.map(template => ({
        ...template,
        images: template.template_images.sort((a, b) => a.display_order - b.display_order),
        category: template.template_categories.map(tc => tc.categories.id),
        tags: template.template_tags.map(tt => tt.tags.name),
        canvaUrl: template.canvaurl
      }));
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
              url,
              alt,
              display_order
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
      const templates = data.map(item => item.templates);
      return templates.map(template => ({
        ...template,
        images: template.template_images.sort((a, b) => a.display_order - b.display_order),
        category: template.template_categories.map(tc => tc.categories.id),
        tags: template.template_tags.map(tt => tt.tags.name),
        canvaUrl: template.canvaurl
      }));
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
      return await templatesSupabaseUtils.fetchData('categories');
    } catch (error) {
      handleError(error, 'Fehler beim Abrufen der Kategorien');
      return [];
    }
  }
}; 