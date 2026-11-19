import { SITE_PHONE_MAX, SITE_SECTION_TITLE_MAX } from '@gruenerator/contracts';
import { Input, Label } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';
import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { Field, SectionHeading } from '../common/Field';
import { ImageUpload } from '../common/ImageUpload';

export function ContactSectionEditor() {
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const { setField } = useDraftActions();
  const title = useDraft((d) => d.contact.title);
  const email = useDraft((d) => d.contact_email);
  const phone = useDraft((d) => d.contact_phone);
  const backgroundImageUrl = useDraft((d) => d.contact.backgroundImageUrl);

  return (
    <div>
      <SectionHeading>Kontakt</SectionHeading>

      <Field panel="contact" path="sections.contact.title" htmlFor="contact-title" label="Titel">
        <Input
          ref={(el) => registerField('sections.contact.title', el)}
          id="contact-title"
          value={title}
          onChange={(e) => setField('contact.title', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'sections.contact.title')}
          onBlur={handleFieldBlur}
          placeholder="Kontakt"
          maxLength={SITE_SECTION_TITLE_MAX}
        />
      </Field>

      <Field panel="contact" path="contact_email" htmlFor="contact-email" label="E-Mail">
        <Input
          ref={(el) => registerField('contact_email', el)}
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setField('contact_email', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'contact_email')}
          onBlur={handleFieldBlur}
          placeholder="kontakt@beispiel.de"
        />
      </Field>

      <Field panel="contact" path="contact_phone" htmlFor="contact-phone" label="Telefon">
        <Input
          ref={(el) => registerField('contact_phone', el)}
          id="contact-phone"
          type="tel"
          value={phone}
          onChange={(e) => setField('contact_phone', e.target.value)}
          onFocus={() => handleFieldFocus('contact', 'contact_phone')}
          onBlur={handleFieldBlur}
          placeholder="+49 123 456789"
          maxLength={SITE_PHONE_MAX}
        />
      </Field>

      <div className="h-px bg-grey-200 dark:bg-grey-700 my-md" />

      <div className="mb-md">
        <Label
          htmlFor="contact-background-image"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          Hintergrundbild
        </Label>
        <ImageUpload
          id="contact-background-image"
          value={backgroundImageUrl}
          onChange={(url) => setField('contact.backgroundImageUrl', url)}
          aspectRatio="16/9"
          placeholder="Kontakt-Hintergrund"
        />
      </div>
    </div>
  );
}
