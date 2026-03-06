import { useRef, useEffect, useState } from 'react';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';

import type { HeroSectionType as HeroSection, SocialLinks } from '@gruenerator/sites-design';

import { cn } from '@/utils/cn';

interface HeroSectionEditorProps {
  data: HeroSection;
  onChange: (data: HeroSection) => void;
}

const DEFAULT_PLATFORMS = ['instagram', 'facebook'] as const;

const ALL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/...' },
  { key: 'twitter', label: 'X/Twitter', placeholder: 'https://x.com/...' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/...' },
  { key: 'mastodon', label: 'Mastodon', placeholder: 'https://mastodon.social/@...' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/...' },
] as const;

export function HeroSectionEditor({ data, onChange }: HeroSectionEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { highlightedElement } = useEditorStore();

  const nameRef = useRef<HTMLInputElement>(null);
  const taglineRef = useRef<HTMLTextAreaElement>(null);

  // Track which additional platforms are visible
  const [visiblePlatforms, setVisiblePlatforms] = useState<string[]>(() => {
    // Start with defaults + any that already have values
    const withValues = ALL_PLATFORMS.filter(
      (p) => data.socialLinks?.[p.key as keyof SocialLinks]
    ).map((p) => p.key);
    return [...new Set([...DEFAULT_PLATFORMS, ...withValues])];
  });

  useEffect(() => {
    registerField('hero', 'name', nameRef.current);
    registerField('hero', 'tagline', taglineRef.current);
  }, [registerField]);

  const updateField = (field: keyof HeroSection, value: string | SocialLinks) => {
    onChange({ ...data, [field]: value });
  };

  const updateSocialLink = (platform: string, url: string) => {
    onChange({
      ...data,
      socialLinks: { ...data.socialLinks, [platform]: url },
    });
  };

  const addPlatform = (key: string) => {
    setVisiblePlatforms((prev) => [...prev, key]);
  };

  const removePlatform = (key: string) => {
    // Remove from visible and clear value
    setVisiblePlatforms((prev) => prev.filter((p) => p !== key));
    const newLinks = { ...data.socialLinks };
    delete newLinks[key as keyof SocialLinks];
    onChange({ ...data, socialLinks: newLinks });
  };

  const isFieldHighlighted = (field: string) => {
    return highlightedElement?.section === 'hero' && highlightedElement?.field === field;
  };

  const availableToAdd = ALL_PLATFORMS.filter((p) => !visiblePlatforms.includes(p.key));

  return (
    <div>
      <h3 className="flex items-center gap-2 m-0 mb-md text-lg font-semibold text-grey-900">
        Profil
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
              isFieldHighlighted('name') && 'animate-[field-highlight_1s_ease]'
            )}
          >
            <label htmlFor="hero-name" className="block text-sm font-medium text-grey-700 mb-1.5">
              Name
            </label>
            <input
              ref={nameRef}
              id="hero-name"
              type="text"
              value={data.name}
              onChange={(e) => updateField('name', e.target.value)}
              onFocus={() => handleFieldFocus('hero', 'name')}
              onBlur={handleFieldBlur}
              placeholder="Max Mustermann"
              className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
            />
          </div>

          <div
            className={cn(
              'mb-0',
              isFieldHighlighted('tagline') && 'animate-[field-highlight_1s_ease]'
            )}
          >
            <label
              htmlFor="hero-tagline"
              className="block text-sm font-medium text-grey-700 mb-1.5"
            >
              Tagline / Slogan
            </label>
            <textarea
              ref={taglineRef}
              id="hero-tagline"
              value={data.tagline}
              onChange={(e) => updateField('tagline', e.target.value)}
              onFocus={() => handleFieldFocus('hero', 'tagline')}
              onBlur={handleFieldBlur}
              placeholder="Kandidat*in für..."
              rows={2}
              className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 resize-y min-h-[100px]"
            />
          </div>
        </div>
      </div>

      <div className="h-px bg-grey-200 my-md" />

      <div>
        <h4 className="text-sm font-semibold mb-3 text-grey-700">Social Media</h4>
        <div className="flex flex-col gap-2.5">
          {ALL_PLATFORMS.filter((p) => visiblePlatforms.includes(p.key)).map(
            ({ key, label, placeholder }) => (
              <div key={key} className="mb-2.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`social-${key}`}
                    className="block text-xs font-medium text-grey-700 mb-1.5"
                  >
                    {label}
                  </label>
                  {!DEFAULT_PLATFORMS.includes(key as (typeof DEFAULT_PLATFORMS)[number]) && (
                    <button
                      type="button"
                      onClick={() => removePlatform(key)}
                      className="bg-transparent border-none text-grey-400 cursor-pointer text-base px-1"
                      title="Entfernen"
                    >
                      ×
                    </button>
                  )}
                </div>
                <input
                  id={`social-${key}`}
                  type="url"
                  value={data.socialLinks?.[key as keyof SocialLinks] || ''}
                  onChange={(e) => updateSocialLink(key, e.target.value)}
                  placeholder={placeholder}
                  className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
                />
              </div>
            )
          )}
        </div>

        {availableToAdd.length > 0 && (
          <div className="mt-2">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  addPlatform(e.target.value);
                  e.target.value = '';
                }
              }}
              className="py-1.5 px-2.5 text-[13px] border border-dashed border-grey-300 rounded bg-grey-50 text-grey-600 cursor-pointer"
              defaultValue=""
            >
              <option value="" disabled>
                + Weiteres Netzwerk hinzufügen
              </option>
              {availableToAdd.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
