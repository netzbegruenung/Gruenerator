import React, { useState, useEffect } from 'react';
import templateData from './utils/templates.json';
import TemplateCard from './components/TemplateCard';
import ErrorBoundary from '../../components/ErrorBoundary';

const TemplateGallery = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      setTemplates(templateData.templates);
      setCategories([
        { id: 'all', label: 'Alle' },
        ...templateData.categories
      ]);
    } catch (err) {
      setError('Fehler beim Laden der Templates');
      console.error('Error loading templates:', err);
    }
  }, []);

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = 
      template.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || template.category.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  if (error) {
    return <div className="template-gallery-error">{error}</div>;
  }

  return (
    <ErrorBoundary>
      <div className="template-gallery">
        <div className="template-gallery-header">
          <h1>Canva Vorlagen</h1>
          <p className="template-gallery-intro">
            Hier findest du professionell gestaltete Vorlagen für deine grüne Kommunikation. 
            Alle Templates sind im Corporate Design gestaltet und können mit einem Klick in Canva geöffnet und bearbeitet werden. 
            Wähle eine Kategorie oder nutze die Suchfunktion, um die passende Vorlage zu finden.
          </p>
          
          <div className="search-bar">
            <input
              type="text"
              placeholder="Vorlagen durchsuchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Vorlagen durchsuchen"
            />
          </div>

          <div className="category-filter">
            {categories.map(category => (
              <button
                key={category.id}
                className={`category-button ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category.id)}
                aria-pressed={selectedCategory === category.id}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="template-grid">
          {filteredTemplates.length === 0 ? (
            <div className="no-results">Keine Templates gefunden</div>
          ) : (
            filteredTemplates.map(template => (
              <TemplateCard 
                key={template.id} 
                template={template}
              />
            ))
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default TemplateGallery; 