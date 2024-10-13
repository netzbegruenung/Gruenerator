import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';

const checkAuth = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Benutzer ist nicht authentifiziert');
  }
  return user;
};

export const useSupabaseStorage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const saveContent = useCallback(async (content, linkName, generatedLink) => {
    try {
      await checkAuth();
      console.log('saveContent aufgerufen', { content, linkName, generatedLink });
      setLoading(true);
      setError(null);
      const { data: existingData, error: existingError } = await supabase
        .from('editor_contents')
        .select('id')
        .eq('link_name', linkName)
        .single();
      
      console.log('Existierende Daten überprüft', { existingData, existingError });

      if (existingError && existingError.code !== 'PGRST116') {
        throw existingError;
      }

      let result;
      if (existingData) {
        result = await supabase
          .from('editor_contents')
          .update({ content, updated_at: new Date(), generated_link: generatedLink })
          .eq('id', existingData.id);
      } else {
        result = await supabase
          .from('editor_contents')
          .insert([{ content, link_name: linkName, generated_link: generatedLink, created_at: new Date() }]);
      }

      console.log('Supabase-Operation abgeschlossen', result);

      if (result.error) throw result.error;
      return result.data;
    } catch (err) {
      console.error('Detaillierter Fehler in saveContent:', err);
      console.error('Fehler-Stack:', err.stack);
      if (err.response) {
        console.error('Fehler-Response:', err.response);
      }
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getContent = useCallback(async (linkName) => {
    setLoading(true);
    setError(null);
    try {
      console.log('Versuche Inhalt abzurufen für link_name:', linkName);
      const { data, error } = await supabase
        .from('editor_contents')
        .select('content, link_name, generated_link')
        .eq('link_name', linkName)
        .single();
      
      if (error) {
        console.error('Fehler beim Abrufen des Inhalts:', error);
        throw error;
      }
      console.log('Abgerufene Daten:', data);
      return data.content;
    } catch (err) {
      console.error('Fehler in getContent:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
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
