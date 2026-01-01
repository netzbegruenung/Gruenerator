import { useRef, useEffect } from 'react';
import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';
import type { HeroImageSection } from '../../../types/candidate';

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
    <div className="hero-image-section-editor">
      <h3 className="section-editor-title">Hero-Bild</h3>

      <div className="hero-profile-row">
        <div className="hero-profile-image">
          <ImageUpload
            value={data.imageUrl}
            onChange={(url) => updateField('imageUrl', url)}
            placeholder="Bild"
            size="fill"
          />
        </div>

        <div className="hero-profile-info">
          <div className={`editor-form-group ${isFieldHighlighted('title') ? 'editor-field-highlighted' : ''}`}>
            <label htmlFor="heroimage-title">Hauptbotschaft</label>
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
            />
            <div className={`editor-char-count ${data.title.length > MAX_TITLE_LENGTH * 0.9 ? 'editor-char-count--warning' : ''}`}>
              {data.title.length} / {MAX_TITLE_LENGTH} Zeichen
            </div>
          </div>

          <div className={`editor-form-group ${isFieldHighlighted('subtitle') ? 'editor-field-highlighted' : ''}`}>
            <label htmlFor="heroimage-subtitle">Untertitel</label>
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
            />
            <div className={`editor-char-count ${data.subtitle.length > MAX_SUBTITLE_LENGTH * 0.9 ? 'editor-char-count--warning' : ''}`}>
              {data.subtitle.length} / {MAX_SUBTITLE_LENGTH} Zeichen
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
