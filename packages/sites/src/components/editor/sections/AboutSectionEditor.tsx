import { SITE_ABOUT_MAX_LENGTH, SITE_SECTION_TITLE_MAX } from '@gruenerator/contracts';
import { getAboutFragment } from '@gruenerator/contracts/site-ydoc';
import { Input } from '@gruenerator/ui';
import { useMemo } from 'react';

import { useDraft, useDraftActions, useSiteYdoc } from '../../../draft/SiteDraftContext';
import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { Field, SectionHeading } from '../common/Field';
import { RichTextEditor } from '../common/RichTextEditorLazy';

export function AboutSectionEditor() {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const ydoc = useSiteYdoc();
  const { setField } = useDraftActions();
  const title = useDraft((d) => d.about.title);
  const fragment = useMemo(() => getAboutFragment(ydoc), [ydoc]);

  return (
    <div>
      <SectionHeading>Über mich</SectionHeading>

      <Field panel="about" path="sections.about.title" htmlFor="about-title" label="Titel">
        <Input
          ref={(el) => registerField('about', 'sections.about.title', el)}
          id="about-title"
          value={title}
          onChange={(e) => setField('about.title', e.target.value)}
          onFocus={() => handleFieldFocus('about', 'sections.about.title')}
          onBlur={handleFieldBlur}
          placeholder="Wer ich bin"
          maxLength={SITE_SECTION_TITLE_MAX}
        />
      </Field>

      <Field panel="about" path="sections.about.content" htmlFor="about-content" label="Inhalt">
        <RichTextEditor
          id="about-content"
          fragment={fragment}
          onFocus={() => handleFieldFocus('about', 'sections.about.content')}
          onBlur={handleFieldBlur}
          placeholder="Erzähle etwas über dich, deinen Werdegang und deine Motivation..."
          maxLength={SITE_ABOUT_MAX_LENGTH}
          minHeight="200px"
        />
      </Field>
    </div>
  );
}
