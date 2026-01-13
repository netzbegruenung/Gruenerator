import { useRef, useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { FaTrash } from 'react-icons/fa';
import { PiTextT, PiPlus, PiMagicWand } from 'react-icons/pi';
import type { TextSectionProps } from '../types';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';
import { AlternativesSection } from './AlternativesSection';
import '../../../../../assets/styles/components/form/form-inputs.css';
import './TextSection.css';

interface TextControlProps {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;

  minRows?: number;
  onRemove?: () => void;
  type?: 'header' | 'body';
}

export function TextControl({
  value,
  onChange,
  placeholder,
  minRows = 1,
  onRemove,
  type = 'body'
}: TextControlProps) {

  return (
    <div className="text-control-wrapper">
      <div className="text-control-input">
        <TextareaAutosize
          className={`form-textarea ${type === 'header' ? 'is-header' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          minRows={minRows}
        />
        {onRemove && (
          <button
            className="btn btn-icon btn-sm text-control-remove"
            onClick={onRemove}
            title="Entfernen"
          >
            <FaTrash />
          </button>
        )}
      </div>
    </div>
  );
}

export function TextSection({
  quote,
  name,
  onQuoteChange,
  onNameChange,
  onAddHeader,
  onAddText,
  additionalTexts = [],
  onUpdateAdditionalText,
  onRemoveAdditionalText,
  alternatives,
  onAlternativeSelect,
}: TextSectionProps) {

  const subsections: Subsection[] = [
    {
      id: 'edit',
      label: 'Bearbeiten',
      icon: PiTextT,
      content: (
        <div className="sidebar-section sidebar-section--text">
          <TextControl
            value={quote}
            onChange={onQuoteChange}
            placeholder="Zitat eingeben..."
            minRows={2}
            type="header"
          />

          <TextControl
            value={name}
            onChange={onNameChange}
            placeholder="Name eingeben..."
          />

          {/* Additional Texts List */}
          {additionalTexts.length > 0 && (
            <div className="additional-texts-list">
              {additionalTexts.map((item) => (
                <TextControl
                  key={item.id}
                  value={item.text}
                  onChange={(val) => onUpdateAdditionalText?.(item.id, val)}
                  placeholder={item.type === 'header' ? "Zusatz-Header..." : "Zusatz-Text..."}
                  onRemove={() => onRemoveAdditionalText?.(item.id)}
                  type={item.type}
                />
              ))}
            </div>
          )}

          {/* Inline add buttons - desktop only */}
          {(onAddHeader || onAddText) && (
            <div className="text-add-inline">
              {onAddHeader && (
                <button className="btn btn-secondary btn-sm" onClick={onAddHeader}>
                  + Überschrift
                </button>
              )}
              {onAddText && (
                <button className="btn btn-secondary btn-sm" onClick={onAddText}>
                  + Text
                </button>
              )}
            </div>
          )}
        </div>
      )
    },
    {
      id: 'add',
      label: 'Hinzufügen',
      icon: PiPlus,
      content: (
        <div className="sidebar-section sidebar-section--text">
          {(onAddHeader || onAddText) && (
            <div className="text-section-actions">
              {onAddHeader && (
                <button className="text-preview-btn header-preview" onClick={onAddHeader}>
                  <span>Überschrift</span>
                </button>
              )}
              {onAddText && (
                <button className="text-preview-btn body-preview" onClick={onAddText}>
                  <span>Fließtext</span>
                </button>
              )}
            </div>
          )}
        </div>
      )
    }
  ];

  if (alternatives && alternatives.length > 0 && onAlternativeSelect) {
    subsections.push({
      id: 'alternatives',
      label: 'Vorlagen',
      icon: PiMagicWand,
      content: (
        <AlternativesSection
          alternatives={alternatives}
          currentQuote={quote}
          onAlternativeSelect={onAlternativeSelect}
        />
      )
    });
  }

  return (
    <SubsectionTabBar
      subsections={subsections}
      defaultSubsection="edit"
    />
  );
}
