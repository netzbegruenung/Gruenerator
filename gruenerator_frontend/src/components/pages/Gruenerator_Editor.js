import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import BaseForm from '../common/BaseForm';
import { supabase } from '../utils/supabaseClient';
import { FormProvider } from '../utils/FormContext';

const Gruenerator_Editor = ({ darkMode }) => {
  const { linkName } = useParams();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('Gruenerator_Editor Seite wurde aufgerufen');
  }, []);

  const fetchContent = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('editor_contents')
        .select('content')
        .eq('link_name', linkName)
        .single();

      if (error) throw error;

      if (data) {
        setContent(data.content);
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

  const handleSubmit = async (updatedContent) => {
    try {
      const { error } = await supabase
        .from('editor_contents')
        .update({ content: updatedContent })
        .eq('link_name', linkName);

      if (error) throw error;

      alert('Inhalt erfolgreich aktualisiert');
    } catch (err) {
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
    <FormProvider initialGeneratedContent={content}>
      <BaseForm
        title={`Gruenerator Editor: ${linkName}`}
        initialContent={content}
        allowEditing={true}
        onSubmit={handleSubmit}
        darkMode={darkMode}
      />
    </FormProvider>
  );
};

Gruenerator_Editor.propTypes = {
  darkMode: PropTypes.bool
};

export default Gruenerator_Editor;
