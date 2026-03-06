import { useRef, useCallback } from 'react';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';
import { MarkdownEditor } from '../common/MarkdownEditor';

import type { ThemesSectionType as ThemesSection, ThemeCard } from '@gruenerator/sites-design';

import { cn } from '@/utils/cn';

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
    <div>
      <h3 className="flex items-center gap-2 m-0 mb-md text-lg font-semibold text-grey-900">
        Meine Themen
      </h3>

      <p className="text-xs text-grey-500 mt-1 mb-md">
        Füge bis zu {MAX_THEMES} politische Schwerpunktthemen hinzu.
      </p>

      <div className="flex flex-col gap-md">
        {data.themes.map((theme, index) => {
          const contentLength = getTextLength(theme.content || '');
          return (
            <div
              key={index}
              className={cn(
                'bg-white border border-grey-200 rounded-lg p-md relative',
                isItemHighlighted(index) &&
                  'border-primary-400 shadow-[0_0_0_2px_rgba(76,175,80,0.2)]'
              )}
            >
              <div className="flex items-center justify-between mb-sm">
                <span className="text-sm font-semibold text-primary-600">Thema {index + 1}</span>
                <div className="flex gap-1">
                  {data.themes.length > 1 && (
                    <button
                      type="button"
                      className="flex items-center justify-center w-8 h-8 border-none bg-transparent rounded-md cursor-pointer text-grey-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      onClick={() => removeTheme(index)}
                      aria-label="Thema entfernen"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div
                className={cn(
                  'mb-md',
                  isFieldHighlighted(index, 'title') && 'animate-[field-highlight_1s_ease]'
                )}
              >
                <label
                  htmlFor={`theme-${index}-title`}
                  className="block text-sm font-medium text-grey-700 mb-1.5"
                >
                  Titel
                </label>
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
                  className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
                />
              </div>

              <div
                className={cn(
                  'mb-md',
                  isFieldHighlighted(index, 'content') && 'animate-[field-highlight_1s_ease]'
                )}
              >
                <label className="block text-sm font-medium text-grey-700 mb-1.5">
                  Beschreibung
                </label>
                <MarkdownEditor
                  value={theme.content}
                  onChange={(markdown) => updateTheme(index, 'content', markdown)}
                  onFocus={() => handleFieldFocus('themes', 'content', index)}
                  onBlur={handleFieldBlur}
                  placeholder="Beschreibe dein Engagement für dieses Thema..."
                  minHeight="120px"
                />
                <div
                  className={cn(
                    'text-xs text-grey-500 text-right mt-1',
                    contentLength > MAX_CONTENT_LENGTH * 0.9 && 'text-yellow-600'
                  )}
                >
                  {contentLength} / {MAX_CONTENT_LENGTH}
                </div>
              </div>

              <div className="mb-md">
                <label className="block text-sm font-medium text-grey-700 mb-1.5">Bild</label>
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
        <button
          type="button"
          className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-grey-300 bg-transparent rounded-lg cursor-pointer text-sm font-medium text-grey-600 transition-colors hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50"
          onClick={addTheme}
        >
          + Thema hinzufügen
        </button>
      )}
    </div>
  );
}
