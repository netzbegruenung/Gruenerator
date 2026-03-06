import { useRef, useEffect } from 'react';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { MarkdownEditor } from '../common/MarkdownEditor';

import type { AboutSectionType as AboutSection } from '@gruenerator/sites-design';

import { cn } from '@/utils/cn';

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
    return markdown.replace(/[#*_[\]()]/g, '').length;
  };

  const contentLength = getTextLength(data.content || '');
  const getCharCountClass = () => {
    if (contentLength > MAX_CONTENT_LENGTH) return 'text-red-600';
    if (contentLength > MAX_CONTENT_LENGTH * 0.9) return 'text-yellow-600';
    return '';
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 m-0 mb-md text-lg font-semibold text-grey-900">
        Über mich
      </h3>

      <div
        className={cn('mb-md', isFieldHighlighted('title') && 'animate-[field-highlight_1s_ease]')}
      >
        <label htmlFor="about-title" className="block text-sm font-medium text-grey-700 mb-1.5">
          Titel
        </label>
        <input
          ref={titleRef}
          id="about-title"
          type="text"
          value={data.title}
          onChange={(e) => updateField('title', e.target.value)}
          onFocus={() => handleFieldFocus('about', 'title')}
          onBlur={handleFieldBlur}
          placeholder="Wer ich bin"
          className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
        />
      </div>

      <div
        className={cn(
          'mb-md',
          isFieldHighlighted('content') && 'animate-[field-highlight_1s_ease]'
        )}
      >
        <label className="block text-sm font-medium text-grey-700 mb-1.5">Inhalt</label>
        <MarkdownEditor
          value={data.content}
          onChange={(markdown) => updateField('content', markdown)}
          onFocus={() => handleFieldFocus('about', 'content')}
          onBlur={handleFieldBlur}
          placeholder="Erzähle etwas über dich, deinen Werdegang und deine Motivation..."
          minHeight="200px"
        />
        <div className={cn('text-xs text-grey-500 text-right mt-1', getCharCountClass())}>
          {contentLength} / {MAX_CONTENT_LENGTH} Zeichen
        </div>
      </div>
    </div>
  );
}
