import { createClient } from '@supabase/supabase-js';
import { handleError } from './errorHandling';

// Supabase Konfiguration für die Templates aus Umgebungsvariablen
const supabaseUrl = import.meta.env.VITE_TEMPLATES_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_TEMPLATES_SUPABASE_ANON_KEY;

// Singleton pattern to prevent multiple client instances
let templatesSupabase = null;

const createTemplatesSupabaseClient = () => {
  if (templatesSupabase) {
    return templatesSupabase;
  }

  if (supabaseUrl && supabaseKey) {
    try {
      templatesSupabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          storageKey: 'supabase_templates_auth_token'
        }
      });
      console.log('[templatesSupabase] Client initialized successfully.');
      return templatesSupabase;
    } catch (error) {
      console.error(`[templatesSupabase] Failed to initialize client: ${error.message}. Invalid URL?`, { urlProvided: supabaseUrl });
      templatesSupabase = null;
      return null;
    }
  } else {
    console.warn('[templatesSupabase] Environment variables not found. Functionality will be disabled.');
    return null;
  }
};

// Initialize the singleton instance
templatesSupabase = createTemplatesSupabaseClient();

// Exportiere den möglicherweise nullen Client (Benutzer sollten prüfen)
export { templatesSupabase };

// Funktion zum Setzen der Authentifizierungs-Session
export const setTemplatesSupabaseSession = (session) => {
  if (templatesSupabase && session) {
    console.log('[templatesSupabase] Setting user session for authenticated requests');
    templatesSupabase.auth.setSession(session);
  }
};

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
  },

  /**
   * Funktion zum Aktualisieren von Daten in einer Tabelle
   * @param {string} table - Tabellenname
   * @param {Object} data - Zu aktualisierende Daten
   * @param {Object} match - Bedingung zum Identifizieren der zu aktualisierenden Datensätze (z.B. { id: recordId })
   * @returns {Promise} - Promise mit den aktualisierten Daten oder Error
   */
  async updateData(table, data, match) {
    if (!templatesSupabase) {
      const errorMsg = 'Template Supabase client is not initialized. Check environment variables.';
      console.error(errorMsg);
      return Promise.reject(new Error(errorMsg));
    }
    try {
      const { data: result, error } = await templatesSupabase
        .from(table)
        .update(data)
        .match(match)
        .select();

      if (error) throw error;
      return result;
    } catch (error) {
      handleError(error, `Error updating data in ${table}`);
      throw error;
    }
  },

  /**
   * Funktion zum Löschen von Daten aus einer Tabelle
   * @param {string} table - Tabellenname
   * @param {Object} match - Bedingung zum Identifizieren der zu löschenden Datensätze (z.B. { id: recordId })
   * @returns {Promise} - Promise mit den gelöschten Daten (kann je nach Supabase-Einstellung variieren) oder Error
   */
  async deleteData(table, match) {
    if (!templatesSupabase) {
      const errorMsg = 'Template Supabase client is not initialized. Check environment variables.';
      console.error(errorMsg);
      return Promise.reject(new Error(errorMsg));
    }
    try {
      const { data: result, error } = await templatesSupabase
        .from(table)
        .delete()
        .match(match)
        .select(); // select() after delete might return the deleted records or an empty array depending on RLS and settings

      if (error) throw error;
      return result;
    } catch (error) {
      handleError(error, `Error deleting data from ${table}`);
      throw error;
    }
  }
}; 