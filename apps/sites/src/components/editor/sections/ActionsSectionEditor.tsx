import { useRef, useCallback } from 'react';
import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';
import type { ActionsSection, ActionTile } from '../../../types/candidate';

interface ActionsSectionEditorProps {
  data: ActionsSection;
  onChange: (data: ActionsSection) => void;
}

const MAX_ACTIONS = 4;
const MAX_TEXT_LENGTH = 50;

const DEFAULT_ACTION: ActionTile = {
  imageUrl: '',
  text: '',
  link: '',
};

const LINK_SUGGESTIONS = [
  { label: 'Spenden', link: '#spenden' },
  { label: 'Newsletter', link: '#newsletter' },
  { label: 'Mitglied werden', link: 'https://gruene.de/mitglied-werden' },
  { label: 'Kontakt', link: '#kontakt' },
];

export function ActionsSectionEditor({ data, onChange }: ActionsSectionEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { highlightedElement } = useEditorStore();

  const textRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const linkRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const setTextRef = useCallback((index: number, el: HTMLInputElement | null) => {
    if (el) {
      textRefs.current.set(index, el);
      registerField('actions', 'text', el, index);
    }
  }, [registerField]);

  const setLinkRef = useCallback((index: number, el: HTMLInputElement | null) => {
    if (el) {
      linkRefs.current.set(index, el);
      registerField('actions', 'link', el, index);
    }
  }, [registerField]);

  const updateAction = (index: number, field: keyof ActionTile, value: string) => {
    const newActions = [...data.actions];
    newActions[index] = { ...newActions[index], [field]: value };
    onChange({ ...data, actions: newActions });
  };

  const addAction = () => {
    if (data.actions.length >= MAX_ACTIONS) return;
    onChange({ ...data, actions: [...data.actions, { ...DEFAULT_ACTION }] });
  };

  const removeAction = (index: number) => {
    if (data.actions.length <= 1) return;
    const newActions = data.actions.filter((_, i) => i !== index);
    onChange({ ...data, actions: newActions });
  };

  const isItemHighlighted = (index: number) => {
    return highlightedElement?.section === 'actions' && highlightedElement?.index === index;
  };

  const isFieldHighlighted = (index: number, field: string) => {
    return isItemHighlighted(index) && highlightedElement?.field === field;
  };

  return (
    <div className="actions-section-editor">
      <h3 className="section-editor-title">Aktionen</h3>

      <p className="editor-form-hint" style={{ marginBottom: '16px' }}>
        Call-to-Action Kacheln, die Besucher zum Handeln auffordern.
      </p>

      <div className="editor-array-items">
        {data.actions.map((action, index) => (
          <div
            key={index}
            className={`editor-array-item ${isItemHighlighted(index) ? 'editor-array-item--highlighted' : ''}`}
          >
            <div className="editor-array-item-header">
              <span className="editor-array-item-number">Aktion {index + 1}</span>
              <div className="editor-array-item-actions">
                {data.actions.length > 1 && (
                  <button
                    type="button"
                    className="editor-icon-button editor-icon-button--delete"
                    onClick={() => removeAction(index)}
                    aria-label="Aktion entfernen"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className={`editor-form-group ${isFieldHighlighted(index, 'text') ? 'editor-field-highlighted' : ''}`}>
              <label htmlFor={`action-${index}-text`}>Button-Text</label>
              <input
                ref={(el) => setTextRef(index, el)}
                id={`action-${index}-text`}
                type="text"
                value={action.text}
                onChange={(e) => updateAction(index, 'text', e.target.value)}
                onFocus={() => handleFieldFocus('actions', 'text', index)}
                onBlur={handleFieldBlur}
                placeholder="z.B. Unterstütze uns!"
                maxLength={MAX_TEXT_LENGTH}
              />
            </div>

            <div className={`editor-form-group ${isFieldHighlighted(index, 'link') ? 'editor-field-highlighted' : ''}`}>
              <label htmlFor={`action-${index}-link`}>Link</label>
              <input
                ref={(el) => setLinkRef(index, el)}
                id={`action-${index}-link`}
                type="url"
                value={action.link}
                onChange={(e) => updateAction(index, 'link', e.target.value)}
                onFocus={() => handleFieldFocus('actions', 'link', index)}
                onBlur={handleFieldBlur}
                placeholder="https://... oder #section"
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                {LINK_SUGGESTIONS.map(({ label, link }) => (
                  <button
                    key={link}
                    type="button"
                    onClick={() => updateAction(index, 'link', link)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      border: '1px solid var(--grey-300)',
                      borderRadius: '4px',
                      background: action.link === link ? 'var(--primary-50)' : 'white',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="editor-form-group">
              <label>Hintergrundbild</label>
              <ImageUpload
                value={action.imageUrl}
                onChange={(url) => updateAction(index, 'imageUrl', url)}
                aspectRatio="16/9"
                placeholder="Aktionsbild"
              />
            </div>
          </div>
        ))}
      </div>

      {data.actions.length < MAX_ACTIONS && (
        <button type="button" className="editor-add-button" onClick={addAction}>
          + Aktion hinzufügen
        </button>
      )}
    </div>
  );
}
