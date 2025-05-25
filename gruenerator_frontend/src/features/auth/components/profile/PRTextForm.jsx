import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import makeAnimated from 'react-select/animated';

const animatedComponents = makeAnimated();

const PRTextForm = ({ initialData, categories, tags, onSubmit, onCancel, isLoading }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setContent(initialData.content || '');
      // TODO: Load initial selected categories and tags based on initialData.id by querying join tables
      // This requires an additional fetch or passing pre-fetched relations.
      // For now, we'll leave them empty on edit.
      // setSelectedCategories(initialData.categories.map(cat => ({ value: cat.id, label: cat.name })));
      // setSelectedTags(initialData.tags.map(tag => ({ value: tag.id, label: tag.name })));
      setSelectedCategories(initialData.preSelectedCategories || []);
      setSelectedTags(initialData.preSelectedTags || []);
    } else {
      setTitle('');
      setContent('');
      setSelectedCategories([]);
      setSelectedTags([]);
    }
  }, [initialData]);

  const categoryOptions = categories.map(cat => ({ value: cat.id, label: cat.name }));
  const tagOptions = tags.map(tag => ({ value: tag.id, label: tag.name }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      // Basic validation, can be expanded
      alert('Titel und Inhalt dürfen nicht leer sein.');
      return;
    }
    onSubmit({
      title,
      content,
      category_ids: selectedCategories.map(cat => cat.value),
      tag_ids: selectedTags.map(tag => tag.value),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="profile-form pr-text-form">
      <div className="form-group">
        <label htmlFor="pr-text-title">Titel</label>
        <input
          id="pr-text-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel des PR-Textes"
          required
          disabled={isLoading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="pr-text-content">Inhalt</label>
        <textarea
          id="pr-text-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Inhalt des PR-Textes"
          rows={8}
          required
          disabled={isLoading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="pr-text-categories">Kategorien</label>
        <Select
          id="pr-text-categories"
          components={animatedComponents}
          isMulti
          options={categoryOptions}
          value={selectedCategories}
          onChange={setSelectedCategories}
          placeholder="Kategorien auswählen..."
          isDisabled={isLoading}
          className="react-select-container"
          classNamePrefix="react-select"
        />
      </div>

      <div className="form-group">
        <label htmlFor="pr-text-tags">Tags</label>
        <Select
          id="pr-text-tags"
          components={animatedComponents}
          isMulti
          options={tagOptions}
          value={selectedTags}
          onChange={setSelectedTags}
          placeholder="Tags auswählen..."
          isDisabled={isLoading}
          className="react-select-container"
          classNamePrefix="react-select"
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="button primary" disabled={isLoading}>
          {isLoading ? (initialData ? 'Speichern...' : 'Erstellen...') : (initialData ? 'Änderungen speichern' : 'Erstellen')}
        </button>
        <button type="button" className="button" onClick={onCancel} disabled={isLoading}>
          Abbrechen
        </button>
      </div>
    </form>
  );
};

PRTextForm.propTypes = {
  initialData: PropTypes.object,
  categories: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  })).isRequired,
  tags: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  })).isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
};

export default PRTextForm; 