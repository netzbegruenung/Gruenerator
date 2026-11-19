import { SITE_TAGLINE_MAX, SITE_TITLE_MAX, SITE_URL_MAX } from '@gruenerator/contracts';
import { Button, Input, Label, Textarea } from '@gruenerator/ui';
import { useState } from 'react';
import { FiX } from 'react-icons/fi';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';
import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { Field, SectionHeading } from '../common/Field';
import { ImageUpload } from '../common/ImageUpload';

const DEFAULT_PLATFORMS = ['instagram', 'facebook'] as const;

const ALL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/...' },
  { key: 'twitter', label: 'X/Twitter', placeholder: 'https://x.com/...' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/...' },
  { key: 'mastodon', label: 'Mastodon', placeholder: 'https://mastodon.social/@...' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/...' },
] as const;

export function HeroSectionEditor() {
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const { setField } = useDraftActions();
  const name = useDraft((d) => d.site_title);
  const tagline = useDraft((d) => d.tagline);
  const profileImage = useDraft((d) => d.profile_image);
  const socialLinks = useDraft((d) => d.social_links);

  const [visiblePlatforms, setVisiblePlatforms] = useState<string[]>(() => {
    const withValues = ALL_PLATFORMS.filter((p) => socialLinks[p.key]).map((p) => p.key);
    return [...new Set([...DEFAULT_PLATFORMS, ...withValues])];
  });

  const updateSocialLink = (platform: string, url: string) => {
    const next = { ...socialLinks };
    if (url === '') delete next[platform];
    else next[platform] = url;
    setField('social_links', next);
  };

  const removePlatform = (key: string) => {
    setVisiblePlatforms((prev) => prev.filter((p) => p !== key));
    updateSocialLink(key, '');
  };

  const availableToAdd = ALL_PLATFORMS.filter((p) => !visiblePlatforms.includes(p.key));

  return (
    <div>
      <SectionHeading>Profil</SectionHeading>

      <div className="flex gap-6 items-stretch mb-5 max-[600px]:flex-col max-[600px]:items-center">
        <div className="shrink-0 basis-[120px] w-[120px] min-w-[120px] flex max-[600px]:w-[100px]">
          <ImageUpload
            value={profileImage}
            onChange={(url) => setField('profile_image', url)}
            placeholder="Bild"
            size="fill"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <Field panel="hero" path="site_title" htmlFor="hero-name" label="Name">
            <Input
              ref={(el) => registerField('site_title', el)}
              id="hero-name"
              value={name}
              onChange={(e) => setField('site_title', e.target.value)}
              onFocus={() => handleFieldFocus('hero', 'site_title')}
              onBlur={handleFieldBlur}
              placeholder="Max Mustermann"
              maxLength={SITE_TITLE_MAX}
            />
          </Field>

          <Field panel="hero" path="tagline" htmlFor="hero-tagline" label="Tagline / Slogan">
            <Textarea
              ref={(el) => registerField('tagline', el)}
              id="hero-tagline"
              value={tagline}
              onChange={(e) => setField('tagline', e.target.value)}
              onFocus={() => handleFieldFocus('hero', 'tagline')}
              onBlur={handleFieldBlur}
              placeholder="Kandidat*in für..."
              rows={2}
              maxLength={SITE_TAGLINE_MAX}
            />
          </Field>
        </div>
      </div>

      <div className="h-px bg-grey-200 dark:bg-grey-700 my-md" />

      <div>
        <h4 className="text-sm font-semibold mb-3 text-foreground">Social Media</h4>
        <div className="flex flex-col gap-2.5">
          {ALL_PLATFORMS.filter((p) => visiblePlatforms.includes(p.key)).map(
            ({ key, label, placeholder }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor={`social-${key}`} className="text-xs font-medium text-foreground">
                    {label}
                  </Label>
                  {!DEFAULT_PLATFORMS.some((p) => p === key) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removePlatform(key)}
                      aria-label={`${label} entfernen`}
                    >
                      <FiX aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <Input
                  ref={(el) => registerField(`social_links.${key}`, el)}
                  id={`social-${key}`}
                  type="url"
                  value={socialLinks[key] ?? ''}
                  onChange={(e) => updateSocialLink(key, e.target.value)}
                  onFocus={() => handleFieldFocus('hero', `social_links.${key}`)}
                  onBlur={handleFieldBlur}
                  placeholder={placeholder}
                  maxLength={SITE_URL_MAX}
                />
              </div>
            )
          )}
        </div>

        {availableToAdd.length > 0 && (
          <div className="mt-2">
            <Label htmlFor="social-add" className="sr-only">
              Weiteres Netzwerk hinzufügen
            </Label>
            <select
              id="social-add"
              onChange={(e) => {
                const key = e.target.value;
                if (key) setVisiblePlatforms((prev) => [...prev, key]);
              }}
              className="py-1.5 px-2.5 text-[13px] border border-dashed border-grey-300 dark:border-grey-700 rounded bg-grey-50 dark:bg-grey-900 text-grey-600 dark:text-grey-400 cursor-pointer"
              value=""
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
