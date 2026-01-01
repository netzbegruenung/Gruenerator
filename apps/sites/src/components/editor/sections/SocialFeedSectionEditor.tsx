import { useRef, useEffect } from 'react';
import { FaInstagram } from 'react-icons/fa';
import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import type { SocialFeedSection } from '../../../types/candidate';

interface SocialFeedSectionEditorProps {
  data: SocialFeedSection;
  onChange: (data: SocialFeedSection) => void;
}

export function SocialFeedSectionEditor({ data, onChange }: SocialFeedSectionEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { highlightedElement } = useEditorStore();

  const titleRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerField('socialFeed', 'title', titleRef.current);
    registerField('socialFeed', 'instagramUsername', usernameRef.current);
  }, [registerField]);

  const updateField = <K extends keyof SocialFeedSection>(field: K, value: SocialFeedSection[K]) => {
    onChange({ ...data, [field]: value });
  };

  const isFieldHighlighted = (field: string) => {
    return highlightedElement?.section === 'socialFeed' && highlightedElement?.field === field;
  };

  const cleanUsername = (value: string) => {
    return value.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');
  };

  return (
    <div className="social-feed-section-editor">
      <h3 className="section-editor-title">
        <FaInstagram style={{ marginRight: '8px', color: '#E4405F' }} />
        Instagram Feed
      </h3>

      <div className="editor-form-group">
        <label className="editor-toggle-label">
          <input
            type="checkbox"
            checked={data.showFeed}
            onChange={(e) => updateField('showFeed', e.target.checked)}
          />
          <span>Instagram-Feed anzeigen</span>
        </label>
      </div>

      {data.showFeed && (
        <>
          <div className={`editor-form-group ${isFieldHighlighted('title') ? 'editor-field-highlighted' : ''}`}>
            <label htmlFor="socialfeed-title">Abschnittstitel</label>
            <input
              ref={titleRef}
              id="socialfeed-title"
              type="text"
              value={data.title}
              onChange={(e) => updateField('title', e.target.value)}
              onFocus={() => handleFieldFocus('socialFeed', 'title')}
              onBlur={handleFieldBlur}
              placeholder="Instagram"
            />
          </div>

          <div className={`editor-form-group ${isFieldHighlighted('instagramUsername') ? 'editor-field-highlighted' : ''}`}>
            <label htmlFor="socialfeed-username">Instagram-Benutzername</label>
            <div className="editor-input-with-prefix">
              <span className="editor-input-prefix">@</span>
              <input
                ref={usernameRef}
                id="socialfeed-username"
                type="text"
                value={data.instagramUsername || ''}
                onChange={(e) => updateField('instagramUsername', cleanUsername(e.target.value))}
                onFocus={() => handleFieldFocus('socialFeed', 'instagramUsername')}
                onBlur={handleFieldBlur}
                placeholder="benutzername"
              />
            </div>
            <p className="editor-field-hint">
              Der Benutzername deines öffentlichen Instagram-Profils
            </p>
          </div>

          <div className="editor-info-box">
            <p>
              <strong>Datenschutz-Hinweis:</strong> Der Instagram-Feed wird erst geladen,
              nachdem Besucher*innen der Datenübertragung an Meta zugestimmt haben
              (DSGVO-konforme Zwei-Klick-Lösung).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
