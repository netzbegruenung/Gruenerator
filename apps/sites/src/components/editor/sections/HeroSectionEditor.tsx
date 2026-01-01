import { useRef, useEffect, useState } from 'react';
import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';
import type { HeroSection, SocialLinks } from '../../../types/candidate';

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
    const withValues = ALL_PLATFORMS
      .filter(p => data.socialLinks?.[p.key as keyof SocialLinks])
      .map(p => p.key);
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
    setVisiblePlatforms(prev => [...prev, key]);
  };

  const removePlatform = (key: string) => {
    // Remove from visible and clear value
    setVisiblePlatforms(prev => prev.filter(p => p !== key));
    const newLinks = { ...data.socialLinks };
    delete newLinks[key as keyof SocialLinks];
    onChange({ ...data, socialLinks: newLinks });
  };

  const isFieldHighlighted = (field: string) => {
    return highlightedElement?.section === 'hero' && highlightedElement?.field === field;
  };

  const availableToAdd = ALL_PLATFORMS.filter(p => !visiblePlatforms.includes(p.key));

  return (
    <div className="hero-section-editor">
      <h3 className="section-editor-title">Profil</h3>

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
          <div className={`editor-form-group ${isFieldHighlighted('name') ? 'editor-field-highlighted' : ''}`}>
            <label htmlFor="hero-name">Name</label>
            <input
              ref={nameRef}
              id="hero-name"
              type="text"
              value={data.name}
              onChange={(e) => updateField('name', e.target.value)}
              onFocus={() => handleFieldFocus('hero', 'name')}
              onBlur={handleFieldBlur}
              placeholder="Max Mustermann"
            />
          </div>

          <div className={`editor-form-group ${isFieldHighlighted('tagline') ? 'editor-field-highlighted' : ''}`}>
            <label htmlFor="hero-tagline">Tagline / Slogan</label>
            <textarea
              ref={taglineRef}
              id="hero-tagline"
              value={data.tagline}
              onChange={(e) => updateField('tagline', e.target.value)}
              onFocus={() => handleFieldFocus('hero', 'tagline')}
              onBlur={handleFieldBlur}
              placeholder="Kandidat*in für..."
              rows={2}
            />
          </div>
        </div>
      </div>

      <div className="editor-section-divider" />

      <div className="editor-social-links-section">
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--grey-700)' }}>
          Social Media
        </h4>
        <div className="editor-social-links">
          {ALL_PLATFORMS
            .filter(p => visiblePlatforms.includes(p.key))
            .map(({ key, label, placeholder }) => (
              <div key={key} className="editor-form-group editor-social-field" style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor={`social-${key}`} style={{ fontSize: '12px' }}>{label}</label>
                  {!DEFAULT_PLATFORMS.includes(key as typeof DEFAULT_PLATFORMS[number]) && (
                    <button
                      type="button"
                      onClick={() => removePlatform(key)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--grey-400)',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: '0 4px',
                      }}
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
                />
              </div>
            ))}
        </div>

        {availableToAdd.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  addPlatform(e.target.value);
                  e.target.value = '';
                }
              }}
              style={{
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px dashed var(--grey-300)',
                borderRadius: '4px',
                background: 'var(--grey-50)',
                color: 'var(--grey-600)',
                cursor: 'pointer',
              }}
              defaultValue=""
            >
              <option value="" disabled>+ Weiteres Netzwerk hinzufügen</option>
              {availableToAdd.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
