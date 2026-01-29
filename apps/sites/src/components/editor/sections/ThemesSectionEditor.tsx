import { useRef, useCallback } from 'react';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';
import { MarkdownEditor } from '../common/MarkdownEditor';

import type { ThemesSection, ThemeCard } from '../../../types/candidate';

interface ThemesSectionEditorProps {
  data: ThemesSection;
  onChange: (data: ThemesSection) => void;
}

const MAX_THEMES = 6;
const MAX_TITLE_LENGTH = 40;
const MAX_CONTENT_LENGTH = 250;

const DEFAULT_THEME: ThemeCard = {
  imageUrl: '',
  title: '',
  content: '',
};

export function ThemesSectionEditor({ data, onChange }: ThemesSectionEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { highlightedElement } = useEditorStore();

  const titleRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const setTitleRef = useCallback(
    (index: number, el: HTMLInputElement | null) => {
      if (el) {
        titleRefs.current.set(index, el);
        registerField('themes', 'title', el, index);
      }
    },
    [registerField]
  );

  const updateTheme = (index: number, field: keyof ThemeCard, value: string) => {
    const newThemes = [...data.themes];
    newThemes[index] = { ...newThemes[index], [field]: value };
    onChange({ ...data, themes: newThemes });
  };

  const addTheme = () => {
    if (data.themes.length >= MAX_THEMES) return;
    onChange({ ...data, themes: [...data.themes, { ...DEFAULT_THEME }] });
  };

  const removeTheme = (index: number) => {
    if (data.themes.length <= 1) return;
    const newThemes = data.themes.filter((_, i) => i !== index);
    onChange({ ...data, themes: newThemes });
  };

  const isItemHighlighted = (index: number) => {
    return highlightedElement?.section === 'themes' && highlightedElement?.index === index;
  };

  const isFieldHighlighted = (index: number, field: string) => {
    return isItemHighlighted(index) && highlightedElement?.field === field;
  };

  const getTextLength = (markdown: string) => {
    return markdown.replace(/[#*_[\]()]/g, '').length;
  };

  return (
    <div className="themes-section-editor">
      <h3 className="section-editor-title">Meine Themen</h3>

      <p className="editor-form-hint" style={{ marginBottom: '16px' }}>
        Füge bis zu {MAX_THEMES} politische Schwerpunktthemen hinzu.
      </p>

      <div className="editor-array-items">
        {data.themes.map((theme, index) => {
          const contentLength = getTextLength(theme.content || '');
          return (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className={`editor-array-item ${isItemHighlighted(index) ? 'editor-array-item--highlighted' : ''}`}
            >
              <div className="editor-array-item-header">
                <span className="editor-array-item-number">Thema {index + 1}</span>
                <div className="editor-array-item-actions">
                  {data.themes.length > 1 && (
                    <button
                      type="button"
                      className="editor-icon-button editor-icon-button--delete"
                      onClick={() => removeTheme(index)}
                      aria-label="Thema entfernen"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div
                className={`editor-form-group ${isFieldHighlighted(index, 'title') ? 'editor-field-highlighted' : ''}`}
              >
                <label htmlFor={`theme-${index}-title`}>Titel</label>
                <input
                  ref={(el) => setTitleRef(index, el)}
                  id={`theme-${index}-title`}
                  type="text"
                  value={theme.title}
                  onChange={(e) => updateTheme(index, 'title', e.target.value)}
                  onFocus={() => handleFieldFocus('themes', 'title', index)}
                  onBlur={handleFieldBlur}
                  placeholder="z.B. Klimaschutz"
                  maxLength={MAX_TITLE_LENGTH}
                />
              </div>

              <div
                className={`editor-form-group ${isFieldHighlighted(index, 'content') ? 'editor-field-highlighted' : ''}`}
              >
                <label>Beschreibung</label>
                <MarkdownEditor
                  value={theme.content}
                  onChange={(markdown) => updateTheme(index, 'content', markdown)}
                  onFocus={() => handleFieldFocus('themes', 'content', index)}
                  onBlur={handleFieldBlur}
                  placeholder="Beschreibe dein Engagement für dieses Thema..."
                  minHeight="120px"
                />
                <div
                  className={`editor-char-count ${contentLength > MAX_CONTENT_LENGTH * 0.9 ? 'editor-char-count--warning' : ''}`}
                >
                  {contentLength} / {MAX_CONTENT_LENGTH}
                </div>
              </div>

              <div className="editor-form-group">
                <label>Bild</label>
                <ImageUpload
                  value={theme.imageUrl}
                  onChange={(url) => updateTheme(index, 'imageUrl', url)}
                  aspectRatio="4/3"
                  placeholder="Themenbild"
                />
              </div>
            </div>
          );
        })}
      </div>

      {data.themes.length < MAX_THEMES && (
        <button type="button" className="editor-add-button" onClick={addTheme}>
          + Thema hinzufügen
        </button>
      )}
    </div>
  );
}
