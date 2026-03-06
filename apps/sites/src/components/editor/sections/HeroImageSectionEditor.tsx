import { useRef, useEffect } from 'react';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';

import type { HeroImageSectionType as HeroImageSection } from '@gruenerator/sites-design';

import { cn } from '@/utils/cn';

interface HeroImageSectionEditorProps {
  data: HeroImageSection;
  onChange: (data: HeroImageSection) => void;
}

const MAX_TITLE_LENGTH = 60;
const MAX_SUBTITLE_LENGTH = 200;

export function HeroImageSectionEditor({ data, onChange }: HeroImageSectionEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { highlightedElement } = useEditorStore();

  const titleRef = useRef<HTMLInputElement>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    registerField('heroImage', 'title', titleRef.current);
    registerField('heroImage', 'subtitle', subtitleRef.current);
  }, [registerField]);

  const updateField = (field: keyof HeroImageSection, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const isFieldHighlighted = (field: string) => {
    return highlightedElement?.section === 'heroImage' && highlightedElement?.field === field;
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 m-0 mb-md text-lg font-semibold text-grey-900">
        Hero-Bild
      </h3>

      <div className="flex gap-6 items-stretch mb-5 max-[600px]:flex-col max-[600px]:items-center">
        <div className="shrink-0 basis-[120px] w-[120px] min-w-[120px] flex max-[600px]:w-[100px]">
          <ImageUpload
            value={data.imageUrl}
            onChange={(url) => updateField('imageUrl', url)}
            placeholder="Bild"
            size="fill"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <div
            className={cn(
              'mb-0',
              isFieldHighlighted('title') && 'animate-[field-highlight_1s_ease]'
            )}
          >
            <label
              htmlFor="heroimage-title"
              className="block text-sm font-medium text-grey-700 mb-1.5"
            >
              Hauptbotschaft
            </label>
            <input
              ref={titleRef}
              id="heroimage-title"
              type="text"
              value={data.title}
              onChange={(e) => updateField('title', e.target.value)}
              onFocus={() => handleFieldFocus('heroImage', 'title')}
              onBlur={handleFieldBlur}
              placeholder="Gemeinsam für eine nachhaltige Zukunft!"
              maxLength={MAX_TITLE_LENGTH}
              className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
            />
            <div
              className={cn(
                'text-xs text-grey-500 text-right mt-1',
                data.title.length > MAX_TITLE_LENGTH * 0.9 && 'text-yellow-600'
              )}
            >
              {data.title.length} / {MAX_TITLE_LENGTH} Zeichen
            </div>
          </div>

          <div
            className={cn(
              'mb-0',
              isFieldHighlighted('subtitle') && 'animate-[field-highlight_1s_ease]'
            )}
          >
            <label
              htmlFor="heroimage-subtitle"
              className="block text-sm font-medium text-grey-700 mb-1.5"
            >
              Untertitel
            </label>
            <textarea
              ref={subtitleRef}
              id="heroimage-subtitle"
              value={data.subtitle}
              onChange={(e) => updateField('subtitle', e.target.value)}
              onFocus={() => handleFieldFocus('heroImage', 'subtitle')}
              onBlur={handleFieldBlur}
              placeholder="Ein unterstützender Satz zu deiner Hauptbotschaft..."
              rows={2}
              maxLength={MAX_SUBTITLE_LENGTH}
              className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 resize-y min-h-[100px]"
            />
            <div
              className={cn(
                'text-xs text-grey-500 text-right mt-1',
                data.subtitle.length > MAX_SUBTITLE_LENGTH * 0.9 && 'text-yellow-600'
              )}
            >
              {data.subtitle.length} / {MAX_SUBTITLE_LENGTH} Zeichen
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
