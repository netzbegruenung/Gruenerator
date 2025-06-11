import React from 'react';
import PropTypes from 'prop-types';
import CanvaTemplateCard from '../../templates/canva/components/CanvaTemplateCard';
import { Link } from 'react-router-dom';
import './TemplatesSection.css';

const ExternalTemplateCard = ({ template }) => (
  <div className="template-card">
    <div className="template-info">
      <h3>{template.title}</h3>
      <p>{template.description}</p>
      <a 
        href={template.url} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="template-link"
      >
        In Canva öffnen
      </a>
    </div>
  </div>
);

const TemplatesSection = ({ templates, className, externalTemplates = [], showStandardTemplates = true }) => {
  // Wenn showStandardTemplates false ist, zeigen wir nur externe Templates
  const allTemplates = showStandardTemplates 
    ? [
        ...templates.map(t => ({ ...t, type: 'internal' })),
        ...externalTemplates.map(t => ({ ...t, type: 'external' }))
      ]
    : externalTemplates.map(t => ({ ...t, type: 'external' }));
  
  const displayedTemplates = allTemplates.slice(0, 4);
  const hasMoreTemplates = allTemplates.length > 4;

  return (
    <section className={`dashboard-section ${className || ''}`}>
      <h2>Canva-Vorlagen</h2>
      {allTemplates.length === 0 ? (
        <div className="no-results">Keine passenden Vorlagen gefunden</div>
      ) : (
        <>
          <div className="templates-grid">
            {displayedTemplates.map(template => (
              template.type === 'external' ? (
                <ExternalTemplateCard 
                  key={template.url} 
                  template={template} 
                />
              ) : (
                <CanvaTemplateCard 
                  key={template.id} 
                  template={template} 
                />
              )
            ))}
          </div>
          {hasMoreTemplates && showStandardTemplates && (
            <div className="view-all-templates">
              <Link to="/templates" className="view-all-link">
                Alle Vorlagen anzeigen ({allTemplates.length})
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
};

ExternalTemplateCard.propTypes = {
  template: PropTypes.shape({
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    url: PropTypes.string.isRequired
  }).isRequired
};

TemplatesSection.propTypes = {
  templates: PropTypes.array.isRequired,
  className: PropTypes.string,
  showStandardTemplates: PropTypes.bool,
  externalTemplates: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      description: PropTypes.string.isRequired,
      url: PropTypes.string.isRequired
    })
  )
};

export default TemplatesSection; 