import { useRef, useEffect } from 'react';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';

import type { ContactSectionType as ContactSection } from '@gruenerator/sites-design';

import { cn } from '@/utils/cn';

interface ContactSectionEditorProps {
  data: ContactSection;
  onChange: (data: ContactSection) => void;
}

export function ContactSectionEditor({ data, onChange }: ContactSectionEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { highlightedElement } = useEditorStore();

  const titleRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    registerField('contact', 'title', titleRef.current);
    registerField('contact', 'email', emailRef.current);
    registerField('contact', 'phone', phoneRef.current);
    registerField('contact', 'address', addressRef.current);
  }, [registerField]);

  const updateField = (field: keyof ContactSection, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const isFieldHighlighted = (field: string) => {
    return highlightedElement?.section === 'contact' && highlightedElement?.field === field;
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 m-0 mb-md text-lg font-semibold text-grey-900">
        Kontakt
      </h3>

      <div
        className={cn('mb-md', isFieldHighlighted('title') && 'animate-[field-highlight_1s_ease]')}
      >
        <label htmlFor="contact-title" className="block text-sm font-medium text-grey-700 mb-1.5">
          Titel
        </label>
        <input
          ref={titleRef}
          id="contact-title"
          type="text"
          value={data.title}
          onChange={(e) => updateField('title', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'title')}
          onBlur={handleFieldBlur}
          placeholder="Kontakt"
          className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
        />
      </div>

      <div
        className={cn('mb-md', isFieldHighlighted('email') && 'animate-[field-highlight_1s_ease]')}
      >
        <label htmlFor="contact-email" className="block text-sm font-medium text-grey-700 mb-1.5">
          E-Mail *
        </label>
        <input
          ref={emailRef}
          id="contact-email"
          type="email"
          value={data.email}
          onChange={(e) => updateField('email', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'email')}
          onBlur={handleFieldBlur}
          placeholder="kontakt@beispiel.de"
          required
          className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
        />
      </div>

      <div
        className={cn('mb-md', isFieldHighlighted('phone') && 'animate-[field-highlight_1s_ease]')}
      >
        <label htmlFor="contact-phone" className="block text-sm font-medium text-grey-700 mb-1.5">
          Telefon
        </label>
        <input
          ref={phoneRef}
          id="contact-phone"
          type="tel"
          value={data.phone || ''}
          onChange={(e) => updateField('phone', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'phone')}
          onBlur={handleFieldBlur}
          placeholder="+49 123 456789"
          className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15"
        />
      </div>

      <div
        className={cn(
          'mb-md',
          isFieldHighlighted('address') && 'animate-[field-highlight_1s_ease]'
        )}
      >
        <label htmlFor="contact-address" className="block text-sm font-medium text-grey-700 mb-1.5">
          Adresse
        </label>
        <textarea
          ref={addressRef}
          id="contact-address"
          value={data.address || ''}
          onChange={(e) => updateField('address', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'address')}
          onBlur={handleFieldBlur}
          placeholder="Musterstraße 1&#10;12345 Musterstadt"
          rows={3}
          className="w-full py-2.5 px-3 font-[family-name:var(--font-family-body)] text-xs border border-grey-300 rounded-md bg-white transition-colors focus:outline-none focus:border-primary-500 focus:ring-[3px] focus:ring-primary-500/15 resize-y min-h-[100px]"
        />
      </div>

      <div className="h-px bg-grey-200 my-md" />

      <div className="mb-md">
        <label className="block text-sm font-medium text-grey-700 mb-1.5">Hintergrundbild</label>
        <ImageUpload
          value={data.backgroundImageUrl}
          onChange={(url) => updateField('backgroundImageUrl', url)}
          aspectRatio="16/9"
          placeholder="Kontakt-Hintergrund"
        />
      </div>
    </div>
  );
}
