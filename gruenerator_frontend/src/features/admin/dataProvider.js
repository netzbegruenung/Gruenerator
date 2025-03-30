import { supabaseDataProvider } from 'ra-supabase-core';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_TEMPLATES_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_TEMPLATES_SUPABASE_ANON_KEY;

let supabase = null;
let baseDataProvider = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);

  // Basis-DataProvider erstellen
  baseDataProvider = supabaseDataProvider({
    instanceUrl: supabaseUrl,
    apiKey: supabaseKey,
    supabaseClient: supabase
  });
} else {
  console.warn('Template Supabase environment variables not found. Admin data provider functionality will be disabled.');
  // Erstelle einen Dummy-DataProvider, der leere/fehlerhafte Antworten gibt
  baseDataProvider = {
    getList: () => Promise.resolve({ data: [], total: 0 }),
    getOne: () => Promise.reject(new Error('Supabase client not configured')),
    getMany: () => Promise.resolve({ data: [] }),
    getManyReference: () => Promise.resolve({ data: [], total: 0 }),
    create: () => Promise.reject(new Error('Supabase client not configured')),
    update: () => Promise.reject(new Error('Supabase client not configured')),
    updateMany: () => Promise.resolve({ data: [] }),
    delete: () => Promise.reject(new Error('Supabase client not configured')),
    deleteMany: () => Promise.resolve({ data: [] }),
  };
}

// Hilfsfunktion zum Konvertieren der Frontend-Daten für die Datenbank
const convertTemplateInput = (data) => {
  // Extrahiere category_ids und template_tags, behalte den Rest
  const { category_ids, template_tags, ...rest } = data;
  return rest;
};

// Erweiterter DataProvider
// Beachte: Die benutzerdefinierten Methoden funktionieren nur, wenn baseDataProvider nicht der Dummy ist.
// Wir müssen in jeder benutzerdefinierten Methode prüfen, ob supabase initialisiert ist.
export const dataProvider = {
  ...baseDataProvider, // Startet mit dem echten oder dem Dummy-Provider

  // Überschreibe die getOne-Methode
  getOne: async (resource, params) => {
    // Wenn der Client nicht konfiguriert ist, nutze die Dummy-Implementierung
    if (!supabase) return baseDataProvider.getOne(resource, params);

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
    
    // Standardverhalten (vom echten baseDataProvider)
    return baseDataProvider.getOne(resource, params);
  },
  
  // Überschreibe die update-Methode
  update: async (resource, params) => {
    // Wenn der Client nicht konfiguriert ist, nutze die Dummy-Implementierung
    if (!supabase) return baseDataProvider.update(resource, params);
    
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
    
    // Standardverhalten (vom echten baseDataProvider)
    return baseDataProvider.update(resource, params);
  },
  
  // Überschreibe die create-Methode
  create: async (resource, params) => {
    // Wenn der Client nicht konfiguriert ist, nutze die Dummy-Implementierung
    if (!supabase) return baseDataProvider.create(resource, params);
    
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
    
    // Standardverhalten (vom echten baseDataProvider)
    return baseDataProvider.create(resource, params);
  },
  
  // Überschreibe die getList-Methode
  getList: async (resource, params) => {
    // Wenn der Client nicht konfiguriert ist, nutze die Dummy-Implementierung
    if (!supabase) return baseDataProvider.getList(resource, params);
    
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
    
    // Standardverhalten (vom echten baseDataProvider)
    return baseDataProvider.getList(resource, params);
  }
}; 