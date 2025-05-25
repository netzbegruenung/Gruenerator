import React, { useState, useEffect, useCallback } from 'react';
import TextInput from '../../../../../components/common/Form/Input/TextInput';
import Spinner from '../../../../../components/common/Spinner';
import Select from 'react-select'; // Import react-select

// Props: 
// initialData (Object, optional, für Bearbeiten),
// onSubmit (Function, erhält Formulardaten),
// onCancel (Function),
// isLoading (Boolean, für den Submit-Prozess)
// availableCategories (Array, {value, label}),
// availableTags (Array, {value, label})
const CanvaTemplateForm = ({ initialData, onSubmit, onCancel, isLoading, availableCategories, availableTags }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [canvaUrl, setCanvaUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [categoryIds, setCategoryIds] = useState([]); 
  const [tagIds, setTagIds] = useState([]);
  const [formError, setFormError] = useState('');

  const isEditMode = !!initialData;

  useEffect(() => {
    if (isEditMode && initialData) {
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setCanvaUrl(initialData.canva_url || '');
      setThumbnailUrl(initialData.thumbnail_url || '');
      setCategoryIds(initialData.category_ids || []); 
      setTagIds(initialData.tag_ids || []);
    } else {
      setTitle('');
      setDescription('');
      setCanvaUrl('');
      setThumbnailUrl('');
      setCategoryIds([]);
      setTagIds([]);
    }
  }, [initialData, isEditMode]); 

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim()) {
      setFormError('Bitte gib einen Titel an.');
      return;
    }
    if (!canvaUrl.trim() || !(/^https?:\/\/(?:www\.)?canva\.com\/.+/i.test(canvaUrl))) {
      setFormError('Bitte gib eine gültige Canva URL an (z.B. https://www.canva.com/design/...).');
      return;
    }
    if (thumbnailUrl.trim() && !(/^https?:\/\/.+/i.test(thumbnailUrl))) {
        setFormError('Bitte gib eine gültige URL für das Vorschaubild an oder lasse das Feld leer.');
        return;
    }

    const formData = {
      title,
      description,
      canva_url: canvaUrl,
      thumbnail_url: thumbnailUrl,
      category_ids: categoryIds,
      tag_ids: tagIds,
    };
    onSubmit(formData);
  };
  
  // Helper to get selected category objects for react-select value prop
  const getSelectedCategoryObjects = () => {
    if (!availableCategories || !categoryIds) return [];
    return availableCategories.filter(cat => categoryIds.includes(cat.value));
  };

  // Helper to get selected tag objects for react-select value prop
  const getSelectedTagObjects = () => {
    if (!availableTags || !tagIds) return [];
    return availableTags.filter(tag => tagIds.includes(tag.value));
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form canva-template-form">
      <h3 className="form-group-title" style={{ marginBottom: 'var(--spacing-medium)'}}>
        {isEditMode ? 'Vorlage bearbeiten' : 'Neue Vorlage erstellen'}
      </h3>

      {formError && (
        <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)'}}>
          {formError}
        </div>
      )}

      <div className="form-field-wrapper">
        <label htmlFor="template-title">Titel <span style={{color: 'var(--error-color, red)'}}>*</span></label>
        <TextInput
          id="template-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Aussagekräftiger Titel für die Vorlage"
          required
          disabled={isLoading}
        />
      </div>

      <div className="form-field-wrapper">
        <label htmlFor="template-description">Beschreibung</label>
        <textarea
          id="template-description"
          className="form-textarea anweisungen-textarea auto-expand-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Kurze Beschreibung, wofür die Vorlage gedacht ist (optional)"
          rows={3}
          disabled={isLoading}
        />
      </div>

      <div className="form-field-wrapper">
        <label htmlFor="template-canva-url">Canva URL <span style={{color: 'var(--error-color, red)'}}>*</span></label>
        <TextInput
          id="template-canva-url"
          type="url"
          value={canvaUrl}
          onChange={(e) => setCanvaUrl(e.target.value)}
          placeholder="https://www.canva.com/design/..."
          required
          disabled={isLoading}
        />
         <p className="help-text" style={{ fontSize: '0.85em', color: 'var(--text-color-secondary)'}}>Der 'Teilen'-Link aus Canva (öffentlich, als Vorlage).</p>
      </div>

      <div className="form-field-wrapper">
        <label htmlFor="template-thumbnail-url">Vorschaubild URL</label>
        <TextInput
          id="template-thumbnail-url"
          type="url"
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://beispiel.de/vorschaubild.jpg (optional)"
          disabled={isLoading}
        />
        <p className="help-text" style={{ fontSize: '0.85em', color: 'var(--text-color-secondary)'}}>Link zu einem Bild, das als Vorschau angezeigt wird.</p>
      </div>
      
      <div className="form-field-wrapper">
        <label htmlFor="template-categories">Kategorien</label>
        <Select 
            isMulti
            id="template-categories"
            inputId="template-categories-input" // Für bessere Zugänglichkeit und Testbarkeit
            options={availableCategories || []}
            value={getSelectedCategoryObjects()} // Verwende Hilfsfunktion
            onChange={(selectedOptions) => setCategoryIds(selectedOptions ? selectedOptions.map(opt => opt.value) : [])}
            placeholder="Kategorien auswählen..."
            isDisabled={isLoading || !availableCategories}
            noOptionsMessage={() => availableCategories ? 'Keine Kategorien gefunden' : 'Lade Kategorien...'}
            classNamePrefix="react-select" // Für benutzerdefiniertes Styling
        />
      </div>

      <div className="form-field-wrapper">
        <label htmlFor="template-tags">Tags</label>
        <Select 
            isMulti
            id="template-tags"
            inputId="template-tags-input"
            options={availableTags || []}
            value={getSelectedTagObjects()} // Verwende Hilfsfunktion
            onChange={(selectedOptions) => setTagIds(selectedOptions ? selectedOptions.map(opt => opt.value) : [])}
            placeholder="Tags auswählen..."
            isDisabled={isLoading || !availableTags}
            noOptionsMessage={() => availableTags ? 'Keine Tags gefunden' : 'Lade Tags...'}
            classNamePrefix="react-select"
        />
      </div>

      <div className="profile-actions" style={{ marginTop: 'var(--spacing-large)'}}>
        <button 
          type="button" 
          className="profile-action-button" 
          onClick={onCancel} 
          disabled={isLoading}
        >
          Abbrechen
        </button>
        <button 
          type="submit" 
          className="profile-action-button profile-primary-button" 
          disabled={isLoading}
          style={{ marginLeft: 'var(--spacing-small)'}}
        >
          {isLoading ? <Spinner size="small" /> : (isEditMode ? 'Änderungen speichern' : 'Vorlage erstellen')}
        </button>
      </div>
    </form>
  );
};

export default CanvaTemplateForm; 