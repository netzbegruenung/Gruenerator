import { createClient } from '@supabase/supabase-js';
import { handleError } from './errorHandling';

// Supabase Konfiguration für die Templates aus Umgebungsvariablen
const supabaseUrl = import.meta.env.VITE_TEMPLATES_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_TEMPLATES_SUPABASE_ANON_KEY;

// Erstelle den Supabase Client für Templates nur, wenn Variablen vorhanden sind
let templatesSupabase = null;
if (supabaseUrl && supabaseKey) {
  templatesSupabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn('Template Supabase environment variables not found. Template functionality will be disabled.');
}

// Exportiere den möglicherweise nullen Client (Benutzer sollten prüfen)
export { templatesSupabase };

// Hilfsfunktionen für häufige Datenbankoperationen
export const templatesSupabaseUtils = {
  /**
   * Generische Funktion zum Abrufen von Daten aus einer Tabelle
   * @param {string} table - Tabellenname
   * @param {Object} options - Query-Optionen (select, filter, etc.)
   * @returns {Promise} - Promise mit den Daten oder Error
   */
  async fetchData(table, options = {}) {
    if (!templatesSupabase) {
      const errorMsg = 'Template Supabase client is not initialized. Check environment variables.';
      console.error(errorMsg);
      // Return empty array instead of throwing
      return Promise.resolve([]); 
    }
    try {
      let query = templatesSupabase.from(table).select(options.select || '*');
      
      if (options.filter) {
        query = query.filter(options.filter.column, options.filter.operator, options.filter.value);
      }
      
      if (options.order) {
        query = query.order(options.order.column, options.order.options);
      }
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data;
    } catch (error) {
      handleError(error, `Error fetching data from ${table}`);
      // Re-throw Supabase errors or errors from handleError
      throw error;
    }
  },
  
  /**
   * Funktion zum Hinzufügen von Daten zu einer Tabelle
   * @param {string} table - Tabellenname
   * @param {Object} data - Zu speichernde Daten
   * @returns {Promise} - Promise mit den gespeicherten Daten oder Error
   */
  async insertData(table, data) {
    if (!templatesSupabase) {
      const errorMsg = 'Template Supabase client is not initialized. Check environment variables.';
      console.error(errorMsg);
      // Return a rejected promise or an object indicating error
      return Promise.reject(new Error(errorMsg)); 
    }
    try {
      const { data: result, error } = await templatesSupabase
        .from(table)
        .insert(data)
        .select();
      
      if (error) throw error;
      return result;
    } catch (error) {
      handleError(error, `Error inserting data into ${table}`);
      // Re-throw Supabase errors or errors from handleError
      throw error;
    }
  }
}; 