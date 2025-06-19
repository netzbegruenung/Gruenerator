const { createClient } = require('@supabase/supabase-js');
require('dotenv').config(); // Ensure environment variables are loaded

// Read from the environment variables - using the standard names first
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_KEY;

let supabaseAnon = null;
let supabaseService = null;

if (!supabaseUrl) {
  console.error('[SupabaseClient] Error: SUPABASE_URL environment variable is not set.');
} else {
  if (supabaseAnonKey) {
    try {
      supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false }
      });
      console.log('[SupabaseClient] Anon client initialized successfully with persistSession: false.');
    } catch (error) {
      console.error(`[SupabaseClient] Failed to initialize Supabase anon client: ${error.message}`);
    }
  } else {
    console.warn('[SupabaseClient] Warning: SUPABASE_ANON_KEY is not set. Anon client not initialized.');
  }

  if (supabaseServiceRoleKey) {
    try {
      supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false }
      });
      console.log('[SupabaseClient] Service Role client initialized successfully with persistSession: false.');
    } catch (error) {
      console.error(`[SupabaseClient] Failed to initialize Supabase service role client: ${error.message}`);
    }
  } else {
    console.warn('[SupabaseClient] Warning: SUPABASE_SERVICE_KEY is not set. Service Role client not initialized. This is required for write operations from the backend.');
  }
}

module.exports = {
  supabaseAnon,
  supabaseService,
}; 