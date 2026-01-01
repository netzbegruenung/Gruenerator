import { useRef, useEffect } from 'react';
import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { MarkdownEditor } from '../common/MarkdownEditor';
import type { AboutSection } from '../../../types/candidate';

interface AboutSectionEditorProps {
  data: AboutSection;
  onChange: (data: AboutSection) => void;
}

const MAX_CONTENT_LENGTH = 2000;

export function AboutSectionEditor({ data, onChange }: AboutSectionEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { highlightedElement } = useEditorStore();

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerField('about', 'title', titleRef.current);
  }, [registerField]);

  const updateField = (field: keyof AboutSection, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const isFieldHighlighted = (field: string) => {
    return highlightedElement?.section === 'about' && highlightedElement?.field === field;
  };

  const getTextLength = (markdown: string) => {
    return markdown.replace(/[#*_\[\]()]/g, '').length;
  };

  const contentLength = getTextLength(data.content || '');
  const getCharCountClass = () => {
    if (contentLength > MAX_CONTENT_LENGTH) return 'editor-char-count--error';
    if (contentLength > MAX_CONTENT_LENGTH * 0.9) return 'editor-char-count--warning';
    return '';
  };

  return (
    <div className="about-section-editor">
      <h3 className="section-editor-title">Über mich</h3>

      <div className={`editor-form-group ${isFieldHighlighted('title') ? 'editor-field-highlighted' : ''}`}>
        <label htmlFor="about-title">Titel</label>
        <input
          ref={titleRef}
          id="about-title"
          type="text"
          value={data.title}
          onChange={(e) => updateField('title', e.target.value)}
          onFocus={() => handleFieldFocus('about', 'title')}
          onBlur={handleFieldBlur}
          placeholder="Wer ich bin"
        />
      </div>

      <div className={`editor-form-group ${isFieldHighlighted('content') ? 'editor-field-highlighted' : ''}`}>
        <label>Inhalt</label>
        <MarkdownEditor
          value={data.content}
          onChange={(markdown) => updateField('content', markdown)}
          onFocus={() => handleFieldFocus('about', 'content')}
          onBlur={handleFieldBlur}
          placeholder="Erzähle etwas über dich, deinen Werdegang und deine Motivation..."
          minHeight="200px"
        />
        <div className={`editor-char-count ${getCharCountClass()}`}>
          {contentLength} / {MAX_CONTENT_LENGTH} Zeichen
        </div>
      </div>
    </div>
  );
}
