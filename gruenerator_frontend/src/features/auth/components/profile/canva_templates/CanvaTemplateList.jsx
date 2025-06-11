import React from 'react';
import { HiPencil, HiTrash, HiPlus } from 'react-icons/hi';
import ProfileTabSkeleton from '../../../../../components/common/UI/ProfileTabSkeleton';

// Props: templates (Array), onEdit (Function), onDelete (Function), onCreate (Function), isLoadingList (Boolean), isProcessing (Boolean)
const CanvaTemplateList = ({ templates, onEdit, onDelete, onCreate, isLoadingList, isProcessing }) => {

  if (isLoadingList) {
    return <ProfileTabSkeleton type="list" itemCount={3} />;
  }

  return (
    <div className="canva-template-list-container">
      <div className="list-actions" style={{ marginBottom: 'var(--spacing-medium)', textAlign: 'right' }}>
        <button 
          onClick={onCreate}
          className="profile-action-button profile-primary-button"
          disabled={isProcessing}
        >
          <HiPlus style={{ marginRight: 'var(--spacing-xxsmall)'}} /> Neue Vorlage erstellen
        </button>
      </div>

      {templates && templates.length > 0 ? (
        <ul className="antraege-list"> {/* Using existing class, will be restyled later */}
          {templates.map((template) => (
            <li key={template.id} className="antrag-item"> {/* Using existing class */}
              <div className="antrag-details" style={{ flexGrow: 1, marginRight: 'var(--spacing-medium)'}}>
                <h4 className="antrag-title" style={{ margin: '0 0 var(--spacing-xsmall) 0' }}>{template.title || 'Unbenannte Vorlage'}</h4>
                {template.thumbnail_url && (
                  <img 
                    src={template.thumbnail_url} 
                    alt={`Vorschau für ${template.title || 'Vorlage'}`} 
                    style={{ maxWidth: '150px', maxHeight: '100px', borderRadius: 'var(--border-radius-small)', marginBottom: 'var(--spacing-xsmall)', border: '1px solid var(--border-color-light)'}} 
                  />
                )}
                {template.description && (
                  <p style={{fontSize: '0.9em', margin: '0 0 var(--spacing-xsmall) 0', color: 'var(--text-color-secondary)'}}>
                    {template.description.substring(0,120)}{template.description.length > 120 && '...'}
                  </p>
                )}
                {template.canva_url && 
                  <a 
                    href={template.canva_url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{fontSize: '0.85em', color: 'var(--link-color)', textDecoration: 'underline', display: 'inline-block', marginBottom: 'var(--spacing-xsmall)'}}
                  >
                    Öffne in Canva
                  </a>
                }
                <div className="antrag-meta" style={{fontSize: '0.8em', color: 'var(--text-color-tertiary)'}}>
                  Erstellt: {new Date(template.created_at).toLocaleDateString()}
                  {template.updated_at && ` | Aktualisiert: ${new Date(template.updated_at).toLocaleDateString()}`}
                </div>
              </div>
              <div className="antrag-actions" style={{ flexShrink: 0 }}>
                <button
                  onClick={() => onEdit(template)}
                  className="icon-button"
                  style={{ marginRight: 'var(--spacing-small)'}}
                  disabled={isProcessing}
                  aria-label={`Vorlage '${template.title || 'Unbenannte Vorlage'}' bearbeiten`}
                >
                  <HiPencil />
                </button>
                <button
                  onClick={() => onDelete(template.id)}
                  className="icon-button danger"
                  disabled={isProcessing}
                  aria-label={`Vorlage '${template.title || 'Unbenannte Vorlage'}' löschen`}
                >
                  <HiTrash />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="antraege-list-placeholder" style={{ textAlign: 'center', padding: 'var(--spacing-large)', color: 'var(--text-color-secondary)'}}>
            <p>Du hast noch keine Canva-Vorlagen erstellt.</p>
            <p>Klicke auf "Neue Vorlage erstellen", um deine erste Vorlage hinzuzufügen.</p>
        </div>
      )}
    </div>
  );
};

export default CanvaTemplateList; 