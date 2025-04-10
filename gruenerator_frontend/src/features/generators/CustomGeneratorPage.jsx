import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import BaseForm from '../../components/common/BaseForm';
import { youSupabaseUtils } from '../../components/utils/youSupabaseClient';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import ErrorBoundary from '../../components/ErrorBoundary';
import SuccessScreen from '../../components/common/SuccessScreen';

const CustomGeneratorPage = ({ showHeaderFooter = true }) => {
  const { slug } = useParams();
  const [generatorConfig, setGeneratorConfig] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { submitForm, loading: submitLoading, success, resetSuccess, error: submitError } = useApiSubmit('/custom_generator');
  const [generatedContent, setGeneratedContent] = useState('');

  useEffect(() => {
    const fetchGeneratorConfig = async () => {
      if (!slug) return;
      setLoading(true);
      setError(null);
      try {
        const data = await youSupabaseUtils.fetchData('custom_generators', {
          filter: { column: 'slug', operator: 'eq', value: slug },
          limit: 1
        });

        if (data && data.length > 0) {
          setGeneratorConfig(data[0]);
          // Initialisiere formData mit leeren Werten für alle Felder
          const initialFormData = {};
          data[0].form_schema.fields.forEach(field => {
            initialFormData[field.name] = '';
          });
          setFormData(initialFormData);
        } else {
          setError('Generator nicht gefunden.');
        }
      } catch (err) {
        setError('Fehler beim Laden des Generators.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchGeneratorConfig();
  }, [slug]);

  const handleInputChange = (fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const handleSubmit = async () => {
    try {
      const response = await submitForm({
        slug,
        formData
      });
      
      if (response) {
        setGeneratedContent(response);
        setTimeout(resetSuccess, 3000);
      }
    } catch (err) {
      console.error('Fehler bei der Generierung:', err);
    }
  };

  if (loading) return <div>Lade...</div>;
  if (error) return <div>Fehler: {error}</div>;
  if (!generatorConfig) return <div>Generator nicht gefunden</div>;

  const renderFormInputs = () => (
    <>
      {generatorConfig.form_schema.fields.map((field) => (
        <div key={field.name} className="form-field">
          <h2><label htmlFor={field.name}>{field.label}</label></h2>
          {field.type === 'textarea' ? (
            <textarea
              id={field.name}
              name={field.name}
              placeholder={field.placeholder}
              value={formData[field.name]}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              required={field.required}
            />
          ) : (
            <input
              type={field.type}
              id={field.name}
              name={field.name}
              placeholder={field.placeholder}
              value={formData[field.name]}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              required={field.required}
            />
          )}
        </div>
      ))}
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          onSubmit={handleSubmit}
          loading={submitLoading}
          success={success}
          error={submitError}
        >
          <h3>{generatorConfig.name}</h3>
          {!generatedContent && (
            <>
             {renderFormInputs()}
             <button type="submit" className="button button-primary" disabled={submitLoading}>
                {submitLoading ? 'Generiere...' : 'Generieren'}
             </button>
            </>
          )}

          {generatedContent && (
            <SuccessScreen
              title="Ergebnis"
              message={<pre>{generatedContent}</pre>}
            >
              <button
                className="button button-secondary"
                onClick={() => navigator.clipboard.writeText(generatedContent)}
              >
                Kopieren
              </button>
              <button
                className="button button-secondary"
                onClick={() => { setGeneratedContent(''); resetSuccess(); }}
              >
                Neu generieren
              </button>
            </SuccessScreen>
          )}

        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default CustomGeneratorPage; 