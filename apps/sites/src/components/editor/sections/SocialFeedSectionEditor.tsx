import { useRef, useEffect } from 'react';
import { FaInstagram } from 'react-icons/fa';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';

import type { SocialFeedSection } from '../../../types/candidate';

import { cn } from '@/utils/cn';

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

  const updateField = <K extends keyof SocialFeedSection>(
    field: K,
    value: SocialFeedSection[K]
  ) => {
    onChange({ ...data, [field]: value });
  };

  const isFieldHighlighted = (field: string) => {
    return highlightedElement?.section === 'socialFeed' && highlightedElement?.field === field;
  };

  const cleanUsername = (value: string) => {
    return value.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 m-0 mb-md text-lg font-semibold text-grey-900">
        <FaInstagram style={{ marginRight: '8px', color: '#E4405F' }} />
        Instagram Feed
      </h3>

      <div className="mb-md">
        <label className="flex items-center gap-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={data.showFeed}
            onChange={(e) => updateField('showFeed', e.target.checked)}
            className="w-5 h-5 accent-primary-600 cursor-pointer"
          />
          <span className="text-base text-grey-700">Instagram-Feed anzeigen</span>
        </label>
      </div>

      {data.showFeed && (
        <>
          <div
            className={cn(
              'mb-md',
              isFieldHighlighted('title') && 'animate-[field-highlight_1s_ease]'
            )}
          >
            <label
              htmlFor="socialfeed-title"
              className="block text-sm font-medium text-grey-700 mb-1.5"
            >
              Abschnittstitel
            </label>
            <input
              ref={titleRef}
              id="socialfeed-title"
              type="text"
              value={data.title}
              onChange={(e) => updateField('title', e.target.value)}
              onFocus={() => handleFieldFocus('socialFeed', 'title')}
              onBlur={handleFieldBlur}
              placeholder="Instagram"
              className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
            />
          </div>

          <div
            className={cn(
              'mb-md',
              isFieldHighlighted('instagramUsername') && 'animate-[field-highlight_1s_ease]'
            )}
          >
            <label
              htmlFor="socialfeed-username"
              className="block text-sm font-medium text-grey-700 mb-1.5"
            >
              Instagram-Benutzername
            </label>
            <div className="flex items-center border border-grey-300 rounded-md overflow-hidden bg-white focus-within:border-primary-500 focus-within:ring-[2px] focus-within:ring-primary-500/15">
              <span className="py-2.5 px-3 bg-grey-100 text-grey-600 text-sm border-r border-grey-300">
                @
              </span>
              <input
                ref={usernameRef}
                id="socialfeed-username"
                type="text"
                value={data.instagramUsername || ''}
                onChange={(e) => updateField('instagramUsername', cleanUsername(e.target.value))}
                onFocus={() => handleFieldFocus('socialFeed', 'instagramUsername')}
                onBlur={handleFieldBlur}
                placeholder="benutzername"
                className="flex-1 border-none py-2.5 px-3 text-sm outline-none"
              />
            </div>
            <p className="text-xs text-grey-500 mt-1">
              Der Benutzername deines öffentlichen Instagram-Profils
            </p>
          </div>

          <div className="p-md bg-primary-100 rounded-sm mt-md">
            <p className="m-0 text-sm text-primary-800 leading-relaxed">
              <strong className="font-semibold">Datenschutz-Hinweis:</strong> Der Instagram-Feed
              wird erst geladen, nachdem Besucher*innen der Datenübertragung an Meta zugestimmt
              haben (DSGVO-konforme Zwei-Klick-Lösung).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
