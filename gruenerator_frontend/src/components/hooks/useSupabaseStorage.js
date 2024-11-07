import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';


export const useSupabaseStorage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const saveContent = useCallback(async (content, linkName, generatedLink) => {
    try {
      console.log('saveContent aufgerufen', { content, linkName, generatedLink });
      setLoading(true);
      setError(null);

      const { data: existingData, error: existingError } = await supabase
        .from('editor_contents')
        .select('*')
        .eq('link_name', linkName)
        .maybeSingle();
      
      console.log('Existierende Daten überprüft', { existingData, existingError });

      if (existingError && existingError.code !== 'PGRST116') {
        console.error('Fehler beim Überprüfen existierender Daten:', existingError);
      }

      let result;
      if (existingData) {
        result = await supabase
          .from('editor_contents')
          .update({ 
            content, 
            updated_at: new Date(), 
            generated_link: generatedLink 
          })
          .eq('id', existingData.id)
          .select();
        
        console.log('Update-Operation durchgeführt', result);
      } else {
        result = await supabase
          .from('editor_contents')
          .insert([{ 
            content, 
            link_name: linkName, 
            generated_link: generatedLink, 
            created_at: new Date() 
          }])
          .select();
        
        console.log('Insert-Operation durchgeführt', result);
      }

      if (result.error) throw result.error;
      
      console.log('Supabase-Operation erfolgreich abgeschlossen', result);
      return { success: true, data: result.data[0] };
    } catch (err) {
      console.error('Detaillierter Fehler in saveContent:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const getContent = useCallback(async (linkIdentifier) => {
    console.log('Versuche Inhalt abzurufen für:', linkIdentifier);
    const { data, error } = await supabase
      .from('editor_contents')
      .select('content, link_name, generated_link')
      .or(`link_name.eq.${linkIdentifier},generated_link.eq.${linkIdentifier}`)
      .maybeSingle();
    
    console.log('Supabase-Antwort:', { data, error });
    
    if (error) {
      console.error('Fehler beim Abrufen des Inhalts:', error);
      throw error;
    }
    return data ? data.content : null;
  }, []);

  const listSavedContents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('editor_contents')
        .select('link_name, created_at, updated_at')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteContent = useCallback(async (linkName) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('editor_contents')
        .delete()
        .eq('link_name', linkName);
      
      if (error) throw error;
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { 
    saveContent, 
    getContent, 
    listSavedContents, 
    deleteContent, 
    loading, 
    error 
  };
};
