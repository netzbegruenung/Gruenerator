import React, { useState, useEffect } from 'react';
import CanvaTemplateCard from './components/CanvaTemplateCard';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { templateService } from '../../../components/utils/templateService';
import GalleryLayout from '../../../components/common/Gallery/GalleryLayout';
import SearchBar from '../../../components/common/Gallery/SearchBar';
import CategoryFilter from '../../../components/common/Gallery/CategoryFilter';

const CanvaTemplateGallery = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadTemplatesAndCategories() {
      try {
        const templatesData = await templateService.getTemplates();
        setTemplates(templatesData);
        
        const categoriesData = await templateService.getCategories();
        setCategories([
          { id: 'all', label: 'Alle' },
          ...categoriesData
        ]);
      } catch (err) {
        setError('Fehler beim Laden der Templates');
        console.error('Error loading templates:', err);
      }
    }
    
    loadTemplatesAndCategories();
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
      <GalleryLayout
        title="Canva Vorlagen"
        introText={
          <>
            Hier findest du professionell gestaltete Vorlagen für deine grüne Kommunikation. 
            Alle Templates sind im Corporate Design gestaltet und können mit einem Klick in Canva geöffnet und bearbeitet werden. 
            Wähle eine Kategorie oder nutze die Suchfunktion, um die passende Vorlage zu finden.
          </>
        }
        searchBar={
          <SearchBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            placeholder="Vorlagen durchsuchen..."
          />
        }
        categoryFilter={
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        }
      >
        {filteredTemplates.length === 0 ? (
          <div className="no-results">Keine Templates gefunden</div>
        ) : (
          filteredTemplates.map(template => (
            <CanvaTemplateCard 
              key={template.id} 
              template={template}
            />
          ))
        )}
      </GalleryLayout>
    </ErrorBoundary>
  );
};

export default CanvaTemplateGallery; 