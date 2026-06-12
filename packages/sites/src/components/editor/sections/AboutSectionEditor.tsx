import { SITE_ABOUT_MAX_LENGTH } from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { useRef, useEffect } from 'react';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { RichTextEditor } from '../common/RichTextEditorLazy';

import type { AboutSectionType as AboutSection } from '@gruenerator/sites-design';

interface AboutSectionEditorProps {
  data: AboutSection;
  onChange: (data: AboutSection) => void;
}

export function AboutSectionEditor({ data, onChange }: AboutSectionEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { highlightedElement } = useEditorStore();

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerField('about', 'title', titleRef.current);
  }, [registerField]);

  const updateField = <K extends keyof AboutSection>(field: K, value: AboutSection[K]) => {
    onChange({ ...data, [field]: value });
  };

  const isFieldHighlighted = (field: string) => {
    return highlightedElement?.section === 'about' && highlightedElement?.field === field;
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 m-0 mb-md text-lg font-semibold text-foreground">
        Über mich
      </h3>

      <div
        className={cn('mb-md', isFieldHighlighted('title') && 'animate-[field-highlight_1s_ease]')}
      >
        <label htmlFor="about-title" className="block text-sm font-medium text-foreground mb-1.5">
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
          className="w-full py-2.5 px-3 text-xs border border-grey-300 dark:border-grey-700 rounded-md bg-background-pure transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
        />
      </div>

      <div
        className={cn(
          'mb-md',
          isFieldHighlighted('content') && 'animate-[field-highlight_1s_ease]'
        )}
      >
        <label className="block text-sm font-medium text-foreground mb-1.5">Inhalt</label>
        <RichTextEditor
          value={data.content}
          onChange={(doc) => updateField('content', doc)}
          onFocus={() => handleFieldFocus('about', 'content')}
          onBlur={handleFieldBlur}
          placeholder="Erzähle etwas über dich, deinen Werdegang und deine Motivation..."
          maxLength={SITE_ABOUT_MAX_LENGTH}
          minHeight="200px"
        />
      </div>
    </div>
  );
}
