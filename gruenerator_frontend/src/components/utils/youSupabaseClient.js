import { createClient } from '@supabase/supabase-js';
import { handleError } from './errorHandling';

// Supabase Konfiguration für die YOU-Instanz aus Umgebungsvariablen
const supabaseUrl = import.meta.env.VITE_YOU_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_YOU_SUPABASE_ANON_KEY;

// Erstelle den Supabase Client für YOU nur, wenn Variablen vorhanden sind
let youSupabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    youSupabase = createClient(supabaseUrl, supabaseKey);
    console.log('[youSupabase] Client initialized successfully.'); // Optional success log
  } catch (error) {
    console.error(`[youSupabase] Failed to initialize client: ${error.message}. Invalid URL?`, { urlProvided: supabaseUrl });
    youSupabase = null; // Ensure client is null on error
  }
} else {
  console.warn('[youSupabase] Environment variables not found. Functionality will be disabled.');
}

// Exportiere den möglicherweise nullen Client
export { youSupabase };

// Hilfsfunktionen für häufige Datenbankoperationen
export const youSupabaseUtils = {
  /**
   * Generische Funktion zum Abrufen von Daten aus einer Tabelle
   * @param {string} table - Tabellenname
   * @param {Object} options - Query-Optionen (select, filter, etc.)
   * @returns {Promise} - Promise mit den Daten oder Error
   */
  async fetchData(table, options = {}) {
    if (!youSupabase) {
      const errorMsg = 'YOU Supabase client is not initialized. Check environment variables.';
      console.error(errorMsg);
      return Promise.resolve([]); 
    }
    try {
      let query = youSupabase.from(table).select(options.select || '*');
      
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
      handleError(error, `Error fetching data from ${table} (YOU instance)`);
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
    if (!youSupabase) {
      const errorMsg = 'YOU Supabase client is not initialized. Check environment variables.';
      console.error(errorMsg);
      return Promise.reject(new Error(errorMsg)); 
    }
    try {
      const { data: result, error } = await youSupabase
        .from(table)
        .insert(data)
        .select();
      
      if (error) throw error;
      return result;
    } catch (error) {
      handleError(error, `Error inserting data into ${table} (YOU instance)`);
      throw error;
    }
  }
}; 