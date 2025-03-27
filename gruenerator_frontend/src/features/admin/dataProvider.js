import { supabaseDataProvider } from 'ra-supabase-core';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_TEMPLATES_SUPABASE_URL,
  import.meta.env.VITE_TEMPLATES_SUPABASE_ANON_KEY
);

export const dataProvider = supabaseDataProvider({
  instanceUrl: import.meta.env.VITE_TEMPLATES_SUPABASE_URL,
  apiKey: import.meta.env.VITE_TEMPLATES_SUPABASE_ANON_KEY,
  supabaseClient: supabase
}); 