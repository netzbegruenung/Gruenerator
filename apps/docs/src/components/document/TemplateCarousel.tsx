import { useState, useEffect, useRef } from 'react';
import { FiChevronDown, FiMoreVertical } from 'react-icons/fi';

import { templates, type TemplateType } from '../../lib/templates';
import './TemplateCarousel.css';

const STORAGE_KEY = 'gruenerator_docs_templates_hidden';

interface TemplateCarouselProps {
  onTemplateSelect: (templateType: TemplateType) => void;
  onShowGallery: () => void;
}

export const TemplateCarousel = ({ onTemplateSelect, onShowGallery }: TemplateCarouselProps) => {
  const [isHidden, setIsHidden] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const toggleHidden = () => {
    const next = !isHidden;
    setIsHidden(next);
    setShowMenu(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // localStorage unavailable
    }
  };

  return (
    <div className="template-carousel-section">
      <div className="template-carousel-header">
        <h2 className="template-carousel-title">Neues Dokument anlegen</h2>

        <div className="template-carousel-actions">
          <button className="template-carousel-gallery-btn" onClick={onShowGallery}>
            Vorlagengalerie <FiChevronDown size={14} />
          </button>

          <div className="template-carousel-divider" />

          <div className="template-carousel-overflow-wrapper" ref={menuRef}>
            <button
              className="template-carousel-overflow-btn"
              onClick={() => setShowMenu((prev) => !prev)}
              aria-label="Weitere Optionen"
            >
              <FiMoreVertical size={18} />
            </button>

            {showMenu && (
              <div className="template-carousel-menu">
                <button className="template-carousel-menu-item" onClick={toggleHidden}>
                  {isHidden ? 'Alle Vorlagen anzeigen' : 'Alle Vorlagen ausblenden'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isHidden && (
        <div className="template-carousel-scroll">
          {templates.map((template) => (
            <button
              key={template.id}
              className="template-carousel-card"
              onClick={() => onTemplateSelect(template.id)}
              title={template.description}
            >
              <div
                className={`template-carousel-card-thumbnail ${
                  template.id === 'blank'
                    ? 'template-carousel-card-thumbnail--blank'
                    : 'template-carousel-card-thumbnail--preview'
                }`}
              >
                {template.id === 'blank' ? (
                  <span className="template-carousel-card-thumbnail-plus">+</span>
                ) : (
                  <div
                    className="template-carousel-card-preview"
                    dangerouslySetInnerHTML={{ __html: template.content }}
                  />
                )}
              </div>
              <div className="template-carousel-card-caption">
                <span className="template-carousel-card-name">{template.name}</span>
                <span className="template-carousel-card-subtitle">{template.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
