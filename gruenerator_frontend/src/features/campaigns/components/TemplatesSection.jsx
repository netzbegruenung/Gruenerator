import React from 'react';
import PropTypes from 'prop-types';
import TemplateCard from '../../templates/components/TemplateCard';
import { Link } from 'react-router-dom';

const TemplatesSection = ({ templates, className }) => {
  // Begrenze die Anzahl der angezeigten Templates auf 4
  const displayedTemplates = templates.slice(0, 4);
  const hasMoreTemplates = templates.length > 4;

  return (
    <section className={`dashboard-section ${className || ''}`}>
      <h2>Canva-Vorlagen</h2>
      {templates.length === 0 ? (
        <div className="no-results">Keine passenden Vorlagen gefunden</div>
      ) : (
        <>
          <div className="templates-grid">
            {displayedTemplates.map(template => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
          {hasMoreTemplates && (
            <div className="view-all-templates">
              <Link to="/templates" className="view-all-link">
                Alle Vorlagen anzeigen ({templates.length})
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
};

TemplatesSection.propTypes = {
  templates: PropTypes.array.isRequired,
  className: PropTypes.string
};

export default TemplatesSection; 