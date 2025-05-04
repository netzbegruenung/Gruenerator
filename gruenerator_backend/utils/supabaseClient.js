const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Ensure environment variables are loaded

// Read from the environment variables with the VITE_TEMPLATES_ prefix
const supabaseUrl = process.env.VITE_TEMPLATES_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_TEMPLATES_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.VITE_TEMPLATES_SUPABASE_SERVICE_KEY;

let supabaseAnon = null;
let supabaseService = null;

if (!supabaseUrl) {
  // Update error message to reflect the expected variable name
  console.error('[SupabaseClient] Error: VITE_TEMPLATES_SUPABASE_URL environment variable is not set.');
} else {
  if (supabaseAnonKey) {
    try {
      supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
      console.log('[SupabaseClient] Anon client initialized successfully.');
    } catch (error) {
      console.error(`[SupabaseClient] Failed to initialize Supabase anon client: ${error.message}`);
    }
  } else {
    // Update warning message to reflect the expected variable name
    console.warn('[SupabaseClient] Warning: VITE_TEMPLATES_SUPABASE_ANON_KEY is not set. Anon client not initialized.');
  }

  if (supabaseServiceRoleKey) {
    try {
      supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey, {
        // Optional: Specify auth persistence if needed, though typically not for service roles
        // auth: { persistSession: false }
      });
      console.log('[SupabaseClient] Service Role client initialized successfully.');
    } catch (error) {
      console.error(`[SupabaseClient] Failed to initialize Supabase service role client: ${error.message}`);
    }
  } else {
    // Update warning message to reflect the expected variable name
    console.warn('[SupabaseClient] Warning: VITE_TEMPLATES_SUPABASE_SERVICE_KEY is not set. Service Role client not initialized. This is required for write operations from the backend.');
  }
}

module.exports = {
  supabaseAnon,
  supabaseService,
}; 