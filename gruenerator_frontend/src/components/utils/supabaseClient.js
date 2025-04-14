import { createClient } from '@supabase/supabase-js';
import { handleError } from './errorHandling';

// Supabase Konfiguration aus Umgebungsvariablen
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Versuche, den Supabase Client zu erstellen
let supabaseInstance = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
    console.log('[supabaseClient] Client initialized successfully.');
  } catch (error) {
    console.error(`[supabaseClient] Failed to initialize client: ${error.message}. Invalid URL?`, { urlProvided: supabaseUrl });
    // supabaseInstance bleibt null
  }
} else {
  console.error('[supabaseClient] Supabase environment variables not found. Check .env file. Functionality will be disabled.');
}

// Exportiere die (möglicherweise null) Supabase-Instanz
export const supabase = supabaseInstance;

// Hilfsfunktionen für häufige Datenbankoperationen
export const supabaseUtils = {
  // Check if supabase client is initialized before making calls
  _getClient() {
    if (!supabase) {
      const errorMsg = 'Supabase client is not initialized. Check environment variables and logs.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    return supabase;
  },

  /**
   * Generische Funktion zum Abrufen von Daten aus einer Tabelle
   * @param {string} table - Tabellenname
   * @param {Object} options - Query-Optionen (select, filter, etc.)
   * @returns {Promise} - Promise mit den Daten oder Error
   */
  async fetchData(table, options = {}) {
    const client = this._getClient(); // Get client or throw error
    try {
      let query = client.from(table).select(options.select || '*');
      
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
      handleError(error, `Fehler beim Abrufen von Daten aus ${table}`);
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
    const client = this._getClient(); // Get client or throw error
    try {
      const { data: result, error } = await client
        .from(table)
        .insert(data)
        .select();
      
      if (error) throw error;
      return result;
    } catch (error) {
      handleError(error, `Fehler beim Hinzufügen von Daten zu ${table}`);
      throw error;
    }
  }
}; 