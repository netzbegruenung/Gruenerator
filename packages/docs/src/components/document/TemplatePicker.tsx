import { useState } from 'react';
import { Button, cn } from '@gruenerator/ui';
import { templates, type TemplateType } from '../../lib/templates';

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
    <div
      className="fixed inset-0 bg-black/50 flex justify-center items-center z-[1000]"
      onClick={handleOverlayClick}
    >
      <div className="w-[90%] max-w-[640px] max-h-[80vh] bg-background dark:border dark:border-grey-700 shadow-lg rounded-xl flex flex-col overflow-hidden">
        <div className="p-lg border-b border-grey-200 dark:border-grey-700">
          <h2 className="text-xl font-semibold text-foreground m-0">Dokumentvorlage wählen</h2>
        </div>

        <div className="p-lg grid grid-cols-2 sm:grid-cols-3 gap-md overflow-y-auto">
          {templates.map((template) => (
            <button
              key={template.id}
              className={cn(
                'flex flex-col items-start gap-1 p-md bg-background border-2 border-grey-200 dark:border-grey-600 rounded-lg cursor-pointer transition-[border-color,box-shadow] duration-150 ease-out text-left font-[inherit] hover:border-grey-400 hover:shadow-sm',
                selected === template.id && 'border-secondary-600 ring-1 ring-secondary-600'
              )}
              onClick={() => handleCardClick(template.id)}
              onDoubleClick={() => handleCardDoubleClick(template.id)}
            >
              <span className="text-[1.75rem] leading-none mb-1">{template.icon}</span>
              <span className="text-[0.9375rem] font-semibold text-foreground">
                {template.name}
              </span>
              <span className="text-[0.8125rem] text-grey-500 leading-snug">
                {template.description}
              </span>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-sm p-lg border-t border-grey-200 dark:border-grey-700">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="brand" onClick={() => onSelect(selected)}>
            Erstellen
          </Button>
        </div>
      </div>
    </div>
  );
};
