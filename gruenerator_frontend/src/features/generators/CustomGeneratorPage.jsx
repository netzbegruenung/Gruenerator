import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import BaseForm from '../../components/common/BaseForm';
import { youSupabaseUtils } from '../../components/utils/youSupabaseClient';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import ErrorBoundary from '../../components/ErrorBoundary';
import '../../assets/styles/components/custom-generator/custom-generator-page.css';
import { FormContext } from '../../components/utils/FormContext';

const CustomGeneratorPage = ({ showHeaderFooter = true }) => {
  const { slug } = useParams();
  const [generatorConfig, setGeneratorConfig] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { submitForm, loading: submitLoading, success, resetSuccess, error: submitError } = useApiSubmit('/custom_generator');
  const [localGeneratedContent, setLocalGeneratedContent] = useState('');
  const { setGeneratedContent } = useContext(FormContext);

  useEffect(() => {
    const fetchGeneratorConfig = async () => {
      if (!slug) return;
      setLoading(true);
      setError(null);
      setLocalGeneratedContent('');
      setGeneratedContent('');
      try {
        const data = await youSupabaseUtils.fetchData('custom_generators', {
          filter: { column: 'slug', operator: 'eq', value: slug },
          limit: 1
        });

        if (data && data.length > 0) {
          setGeneratorConfig(data[0]);
          const initialFormData = {};
          data[0].form_schema.fields.forEach(field => {
            initialFormData[field.name] = field.defaultValue || '';
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
      
      const content = response?.content || (typeof response === 'string' ? response : '');
      
      if (content) {
        setLocalGeneratedContent(content);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      } else {
        setLocalGeneratedContent('');
        setGeneratedContent('');
      }
    } catch (err) {
      console.error('Fehler bei der Generierung:', err);
      setLocalGeneratedContent('');
      setGeneratedContent('');
    }
  };

  const handleReset = () => {
    setLocalGeneratedContent('');
    setGeneratedContent('');
    resetSuccess();
  };

  if (loading) return <div>Lade...</div>;
  if (error) return <div>Fehler: {error}</div>;
  if (!generatorConfig) return <div>Generator nicht gefunden</div>;

  const renderFormInputs = () => (
    <>
      {generatorConfig.form_schema.fields.map((field) => (
        <div key={field.name} className="form-field">
          <label htmlFor={field.name}><h3>{field.label}</h3></label>
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
      <div className={`custom-generator-page-container container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title={generatorConfig.name || generatorConfig.title}
          onSubmit={handleSubmit}
          loading={submitLoading}
          success={success}
          error={submitError}
          generatedContent={localGeneratedContent}
          onReset={handleReset}
          showResetButton={!!localGeneratedContent || Object.values(formData).some(v => v !== '')}
          headerContent={
            <div className="generator-header">
              {generatorConfig.title && <h2 className="generator-title">{generatorConfig.title}</h2>}
              {generatorConfig.description && <p className="generator-description">{generatorConfig.description}</p>}
            </div>
          }
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default CustomGeneratorPage; 