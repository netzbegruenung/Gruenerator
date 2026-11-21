import { SITE_PHONE_MAX, SITE_SECTION_TITLE_MAX } from '@gruenerator/contracts';
import { Input, Label } from '@gruenerator/ui';

import { useDraft, useDraftActions, useDraftBlock } from '../../../draft/SiteDraftContext';
import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { Field, SectionHeading } from '../common/Field';
import { FocalPointPicker } from '../common/FocalPointPicker';
import { ImageUpload } from '../common/ImageUpload';

export function ContactSectionEditor({ blockId }: { blockId: string }) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const { setField, setBlockField } = useDraftActions();
  const block = useDraftBlock(blockId, 'contact');
  const email = useDraft((d) => d.contact_email);
  const phone = useDraft((d) => d.contact_phone);
  if (!block) return null;
  const { title, backgroundImageUrl } = block;
  const backgroundFocus = block.backgroundFocus ?? null;
  const titlePath = `blocks.${blockId}.title`;

  return (
    <div>
      <SectionHeading>Kontakt</SectionHeading>

      <Field panel={blockId} path={titlePath} htmlFor="contact-title" label="Titel">
        <Input
          ref={(el) => registerField(titlePath, el)}
          id="contact-title"
          value={title}
          onChange={(e) => setBlockField(blockId, 'contact', { title: e.target.value })}
          onFocus={() => handleFieldFocus(blockId, titlePath)}
          onBlur={handleFieldBlur}
          placeholder="Kontakt"
          maxLength={SITE_SECTION_TITLE_MAX}
        />
      </Field>

      <Field panel={blockId} path="contact_email" htmlFor="contact-email" label="E-Mail">
        <Input
          ref={(el) => registerField('contact_email', el)}
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setField('contact_email', e.target.value)}
          onFocus={() => handleFieldFocus(blockId, 'contact_email')}
          onBlur={handleFieldBlur}
          placeholder="kontakt@beispiel.de"
        />
      </Field>

      <Field panel={blockId} path="contact_phone" htmlFor="contact-phone" label="Telefon">
        <Input
          ref={(el) => registerField('contact_phone', el)}
          id="contact-phone"
          type="tel"
          value={phone}
          onChange={(e) => setField('contact_phone', e.target.value)}
          onFocus={() => handleFieldFocus(blockId, 'contact_phone')}
          onBlur={handleFieldBlur}
          placeholder="+49 123 456789"
          maxLength={SITE_PHONE_MAX}
        />
      </Field>

      <div className="h-px bg-grey-200 dark:bg-grey-700 my-md" />

      <div className="mb-md">
        <p
          id="contact-background-image-label"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          Hintergrundbild
        </p>
        <ImageUpload
          labelledBy="contact-background-image-label"
          value={backgroundImageUrl}
          onChange={(url) => setBlockField(blockId, 'contact', { backgroundImageUrl: url })}
          aspectRatio="16/9"
          placeholder="Kontakt-Hintergrund"
        />
        {backgroundImageUrl && (
          <FocalPointPicker
            src={backgroundImageUrl}
            value={backgroundFocus}
            onChange={(focus) => setBlockField(blockId, 'contact', { backgroundFocus: focus })}
          />
        )}
      </div>
    </div>
  );
}
