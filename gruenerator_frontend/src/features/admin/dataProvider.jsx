import { supabaseDataProvider } from 'ra-supabase-core';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_TEMPLATES_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_TEMPLATES_SUPABASE_ANON_KEY;

let supabase = null;
let baseDataProvider = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[dataProvider] Supabase client initialized successfully.');
    
    // Basis-DataProvider erstellen
    baseDataProvider = supabaseDataProvider({
      instanceUrl: supabaseUrl,
      apiKey: supabaseKey,
      supabaseClient: supabase
    });
  } catch (error) {
    console.error(`[dataProvider] Failed to initialize Supabase client: ${error.message}. Invalid URL?`, { urlProvided: supabaseUrl });
    supabase = null; // Explicitly set to null on error
  }
} 

// Wenn die Initialisierung fehlschlug (oder Vars fehlten), setze Dummy-Provider
if (!baseDataProvider) {
  console.warn('[dataProvider] Supabase environment variables missing, invalid, or client initialization failed. Admin data provider functionality will be disabled.');
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
  // Behalte nur Felder, die wirklich zur 'templates' Tabelle gehören
  // Entferne hier z.B. 'image_uploads' und 'category_ids', falls sie noch im Objekt sind
  const { category_ids, image_uploads, template_tags, ...rest } = data;
  // Ggf. weitere Felder entfernen
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
      console.warn("dataProvider.update for 'templates' does not handle image modifications!");
      const { category_ids, image_uploads, ...data } = params.data; // image_uploads hier ignorieren
      const { data: updatedTemplate, error } = await supabase
        .from('templates')
        .update(convertTemplateInput(data)) // Nur Template-Felder aktualisieren
        .eq('id', params.id)
        .select()
        .single();
      if (error) throw error;
      // Kategorie-Logik (bleibt gleich)
      if (category_ids && Array.isArray(category_ids)) {
        await supabase.from('template_categories').delete().eq('template_id', params.id);
        if (category_ids.length > 0) {
          const categoryRelations = category_ids.map(category_id => ({ template_id: params.id, category_id }));
          const { error: insertError } = await supabase.from('template_categories').insert(categoryRelations);
          if (insertError) throw insertError;
        }
      }
      return { data: { ...updatedTemplate, category_ids: category_ids || [] } }; // category_ids hinzufügen
    }
    
    // Standardverhalten (vom echten baseDataProvider)
    return baseDataProvider.update(resource, params);
  },
  
  // Überschreibe die create-Methode
  create: async (resource, params) => {
    if (!supabase) return baseDataProvider.create(resource, params); // Dummy-Check

    if (resource === 'templates') {
      const { image_uploads, category_ids, ...templateFields } = params.data;

      // 1. Bereinige die Template-Daten (optional, falls convertTemplateInput verwendet wird)
      const cleanTemplateData = convertTemplateInput(templateFields); 

      // 2. Erstelle FormData
      const formData = new FormData();
      formData.append('templateData', JSON.stringify(cleanTemplateData));
      formData.append('categoryIds', JSON.stringify(category_ids || [])); // Als JSON-Array senden

      // Füge Bilddateien hinzu
      if (image_uploads && Array.isArray(image_uploads)) {
        image_uploads.forEach((fileWrapper) => {
          if (fileWrapper && fileWrapper.rawFile instanceof File) {
            // Wichtig: Der Key 'images' muss mit formData.getAll('images') in der Function übereinstimmen
            formData.append('images', fileWrapper.rawFile, fileWrapper.rawFile.name);
          }
        });
      }

      // 3. Rufe die Edge Function auf
      console.log('Invoking Edge Function: create-template-with-images...');
      try {
        const { data, error } = await supabase.functions.invoke('create-template-with-images', {
          body: formData, // Supabase Client setzt Content-Type für FormData korrekt
        });

        if (error) {
          console.error('Edge Function invocation failed:', error);
          // Versuche, eine detailliertere Fehlermeldung zu extrahieren
          const message = error.context?.message || error.message || 'Function invocation error';
          throw new Error(`Failed to create template via function: ${message}`);
        }

        console.log('Edge Function returned:', data);

        // Prüfe, ob die Funktion die erwartete Struktur { data: ... } zurückgegeben hat
        if (!data || typeof data.data !== 'object') {
          console.warn('Edge function response format unexpected.');
          // Entscheide, wie du reagierst: Fehler werfen oder versuchen, die Daten zu verwenden
          // Wenn die Funktion nur das Template-Objekt zurückgibt:
          // return { data: data }; 
          // Sicherer ist, einen Fehler zu werfen, wenn das Format nicht stimmt:
          throw new Error('Invalid response format from Edge Function.');
        }
        
        // React Admin erwartet { data: { id: ..., ... } }
        return data; 

      } catch (err) {
        console.error('Error invoking function or processing response:', err);
        // Stelle sicher, dass der Fehler an React Admin weitergegeben wird
        throw err instanceof Error ? err : new Error('An unknown error occurred');
      }
    }

    // Standardverhalten für andere Ressourcen
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