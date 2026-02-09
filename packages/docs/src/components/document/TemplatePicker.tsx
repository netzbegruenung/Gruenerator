import { useState } from 'react';
import { templates, type TemplateType } from '../../lib/templates';
import './TemplatePicker.css';

interface TemplatePickerProps {
  onSelect: (type: TemplateType) => void;
  onClose: () => void;
}

export const TemplatePicker = ({ onSelect, onClose }: TemplatePickerProps) => {
  const [selected, setSelected] = useState<TemplateType>('blank');

  const handleCardClick = (id: TemplateType) => {
    setSelected(id);
  };

  const handleCardDoubleClick = (id: TemplateType) => {
    onSelect(id);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="template-picker-overlay" onClick={handleOverlayClick}>
      <div className="template-picker-panel">
        <div className="template-picker-header">
          <h2>Dokumentvorlage wählen</h2>
        </div>

        <div className="template-picker-grid">
          {templates.map((template) => (
            <button
              key={template.id}
              className={`template-card ${selected === template.id ? 'selected' : ''}`}
              onClick={() => handleCardClick(template.id)}
              onDoubleClick={() => handleCardDoubleClick(template.id)}
            >
              <span className="template-card-icon">{template.icon}</span>
              <span className="template-card-name">{template.name}</span>
              <span className="template-card-description">{template.description}</span>
            </button>
          ))}
        </div>

        <div className="template-picker-footer">
          <button className="template-picker-btn cancel" onClick={onClose}>
            Abbrechen
          </button>
          <button className="template-picker-btn confirm" onClick={() => onSelect(selected)}>
            Erstellen
          </button>
        </div>
      </div>
    </div>
  );
};
