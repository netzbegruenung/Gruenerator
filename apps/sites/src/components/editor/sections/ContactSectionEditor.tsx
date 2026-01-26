import { useRef, useEffect } from 'react';

import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { ImageUpload } from '../common/ImageUpload';

import type { ContactSection } from '../../../types/candidate';

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
    <div className="contact-section-editor">
      <h3 className="section-editor-title">Kontakt</h3>

      <div
        className={`editor-form-group ${isFieldHighlighted('title') ? 'editor-field-highlighted' : ''}`}
      >
        <label htmlFor="contact-title">Titel</label>
        <input
          ref={titleRef}
          id="contact-title"
          type="text"
          value={data.title}
          onChange={(e) => updateField('title', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'title')}
          onBlur={handleFieldBlur}
          placeholder="Kontakt"
        />
      </div>

      <div
        className={`editor-form-group ${isFieldHighlighted('email') ? 'editor-field-highlighted' : ''}`}
      >
        <label htmlFor="contact-email">E-Mail *</label>
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
        />
      </div>

      <div
        className={`editor-form-group ${isFieldHighlighted('phone') ? 'editor-field-highlighted' : ''}`}
      >
        <label htmlFor="contact-phone">Telefon</label>
        <input
          ref={phoneRef}
          id="contact-phone"
          type="tel"
          value={data.phone || ''}
          onChange={(e) => updateField('phone', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'phone')}
          onBlur={handleFieldBlur}
          placeholder="+49 123 456789"
        />
      </div>

      <div
        className={`editor-form-group ${isFieldHighlighted('address') ? 'editor-field-highlighted' : ''}`}
      >
        <label htmlFor="contact-address">Adresse</label>
        <textarea
          ref={addressRef}
          id="contact-address"
          value={data.address || ''}
          onChange={(e) => updateField('address', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'address')}
          onBlur={handleFieldBlur}
          placeholder="Musterstraße 1&#10;12345 Musterstadt"
          rows={3}
        />
      </div>

      <div className="editor-section-divider" />

      <div className="editor-form-group">
        <label>Hintergrundbild</label>
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
