import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

const checkEnvironmentVariables = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL oder Anon Key fehlt. Bitte überprüfen Sie Ihre .env-Datei.');
    return false;
  }
  return true;
};

if (!checkEnvironmentVariables()) {
  throw new Error('Supabase-Konfiguration ist unvollständig. Bitte überprüfen Sie Ihre .env-Datei.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const checkSupabaseConnection = async () => {
  try {
    console.log('Überprüfe Supabase-Verbindung...');
    const { data, error } = await supabase.from('editor_contents').select('count', { count: 'exact' });
    if (error) throw error;
    console.log('Supabase-Verbindung erfolgreich. Anzahl der Einträge:', data);
    return true;
  } catch (error) {
    console.error('Fehler bei der Supabase-Verbindung:', error.message);
    return false;
  }
};
