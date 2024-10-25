import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import BaseForm from '../common/BaseForm';
import { supabase } from '../utils/supabaseClient';
import { FormProvider } from '../utils/FormContext';
import { useSupabaseStorage } from '../hooks/useSupabaseStorage';

const Gruenerator_Editor = ({ darkMode }) => {
  const { linkName } = useParams();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [originalLinkData, setOriginalLinkData] = useState(null);

  useEffect(() => {
    console.log('Gruenerator_Editor Seite wurde aufgerufen');
  }, []);

  const fetchContent = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('editor_contents')
        .select('content, link_name, generated_link')
        .or(`link_name.eq.${linkName},generated_link.ilike.%${linkName}%`)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setContent(data.content);
        setOriginalLinkData({
          linkName: data.link_name,
          generatedLink: data.generated_link
        });
      } else {
        throw new Error('Inhalt nicht gefunden');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [linkName]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const { saveContent } = useSupabaseStorage();

  const handleSubmit = async (updatedContent) => {
    try {
      console.log('handleSubmit aufgerufen mit Inhalt:', updatedContent);
      const result = await saveContent(updatedContent, originalLinkData.linkName, originalLinkData.generatedLink);
      if (result.success) {
        setContent(updatedContent);
        console.log('Inhalt erfolgreich aktualisiert:', result.data);
        alert('Inhalt erfolgreich aktualisiert');
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Fehler beim Aktualisieren:', err);
      setError('Fehler beim Aktualisieren: ' + err.message);
    }
  };

  if (loading) return <div>Lade Inhalt...</div>;
  if (error) {
    return (
      <div className="error-message">
        <h2>Fehler beim Laden des Inhalts</h2>
        <p>{error}</p>
        <button onClick={fetchContent}>Erneut versuchen</button>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="error-message">
        <h2>Kein Inhalt gefunden</h2>
        <p>Für diesen Link wurde kein Inhalt gefunden.</p>
      </div>
    );
  }

  return (
    <FormProvider 
      initialGeneratedContent={content} 
      initialEditingMode={true}
      originalLinkData={originalLinkData}
    >
      <BaseForm
        title={`Gruenerator Editor: ${originalLinkData.linkName}`}
        initialContent={content}
        allowEditing={true}
        onSubmit={handleSubmit}
        darkMode={darkMode}
        alwaysEditing={true}
        hideEditButton={true}
        originalLinkData={originalLinkData}
      />
    </FormProvider>
  );
};

Gruenerator_Editor.propTypes = {
  darkMode: PropTypes.bool
};

export default Gruenerator_Editor;
