import { supabaseDataProvider } from 'ra-supabase-core';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_TEMPLATES_SUPABASE_URL,
  import.meta.env.VITE_TEMPLATES_SUPABASE_ANON_KEY
);

// Basis-DataProvider erstellen
const baseDataProvider = supabaseDataProvider({
  instanceUrl: import.meta.env.VITE_TEMPLATES_SUPABASE_URL,
  apiKey: import.meta.env.VITE_TEMPLATES_SUPABASE_ANON_KEY,
  supabaseClient: supabase
});

// Hilfsfunktion zum Konvertieren der Frontend-Daten für die Datenbank
const convertTemplateInput = (data) => {
  // Extrahiere category_ids und template_tags, behalte den Rest
  const { category_ids, template_tags, ...rest } = data;
  return rest;
};

// Erweiterter DataProvider
export const dataProvider = {
  ...baseDataProvider,

  // Überschreibe die getOne-Methode
  getOne: async (resource, params) => {
    if (resource === 'templates') {
      // Template mit allen Relationen laden
      const { data, error } = await supabase
        .from('templates')
        .select(`
          *,
          template_categories (
            category_id,
            categories (
              id,
              label
            )
          ),
          template_tags (
            tags (
              id,
              name
            )
          ),
          template_images (
            id,
            url,
            alt,
            display_order
          )
        `)
        .eq('id', params.id)
        .single();
        
      if (error) throw error;
      
      // Transformation für React-Admin
      return {
        data: {
          ...data,
          category_ids: data.template_categories?.map(tc => tc.category_id) || [],
          // Weitere Transformationen nach Bedarf
        }
      };
    }
    
    // Standardverhalten für andere Ressourcen
    return baseDataProvider.getOne(resource, params);
  },
  
  // Überschreibe die update-Methode
  update: async (resource, params) => {
    if (resource === 'templates') {
      const { category_ids, ...data } = params.data;
      
      // Haupt-Template aktualisieren
      const { data: updatedTemplate, error } = await supabase
        .from('templates')
        .update(convertTemplateInput(data))
        .eq('id', params.id)
        .select()
        .single();
        
      if (error) throw error;
      
      // Verarbeite Kategorien-Beziehungen, wenn vorhanden
      if (category_ids && Array.isArray(category_ids)) {
        // Bestehende Verknüpfungen löschen
        await supabase
          .from('template_categories')
          .delete()
          .eq('template_id', params.id);
          
        // Nur neue Verknüpfungen erstellen, wenn Kategorien ausgewählt wurden
        if (category_ids.length > 0) {
          const categoryRelations = category_ids.map(category_id => ({
            template_id: params.id,
            category_id
          }));
          
          const { error: insertError } = await supabase
            .from('template_categories')
            .insert(categoryRelations);
            
          if (insertError) throw insertError;
        }
      }
      
      // Daten für React-Admin aufbereiten
      return {
        data: { ...updatedTemplate, category_ids }
      };
    }
    
    // Standardverhalten für andere Ressourcen
    return baseDataProvider.update(resource, params);
  },
  
  // Überschreibe die create-Methode
  create: async (resource, params) => {
    if (resource === 'templates') {
      const { category_ids, ...data } = params.data;
      
      // Neues Template erstellen
      const { data: newTemplate, error } = await supabase
        .from('templates')
        .insert(convertTemplateInput(data))
        .select()
        .single();
        
      if (error) throw error;
      
      // Kategorien-Beziehungen erstellen, wenn vorhanden
      if (category_ids && Array.isArray(category_ids) && category_ids.length > 0) {
        const categoryRelations = category_ids.map(category_id => ({
          template_id: newTemplate.id,
          category_id
        }));
        
        const { error: insertError } = await supabase
          .from('template_categories')
          .insert(categoryRelations);
          
        if (insertError) throw insertError;
      }
      
      // Daten für React-Admin aufbereiten
      return {
        data: { ...newTemplate, category_ids: category_ids || [] }
      };
    }
    
    // Standardverhalten für andere Ressourcen
    return baseDataProvider.create(resource, params);
  },
  
  // Überschreibe die getList-Methode
  getList: async (resource, params) => {
    if (resource === 'templates') {
      // Basisimplementierung aufrufen
      const response = await baseDataProvider.getList(resource, params);
      
      // Hole die Kategorie-IDs für jedes Template
      const templatesWithCategories = await Promise.all(
        response.data.map(async template => {
          const { data: categories, error } = await supabase
            .from('template_categories')
            .select('category_id')
            .eq('template_id', template.id);
            
          if (error) throw error;
          
          return {
            ...template,
            category_ids: categories.map(cat => cat.category_id)
          };
        })
      );
      
      return {
        ...response,
        data: templatesWithCategories
      };
    }
    
    // Standardverhalten für andere Ressourcen
    return baseDataProvider.getList(resource, params);
  }
}; 