import { SITE_ABOUT_MAX_LENGTH, SITE_SECTION_TITLE_MAX } from '@gruenerator/contracts';
import { getBlockFragment } from '@gruenerator/contracts/site-ydoc';
import { Input } from '@gruenerator/ui';
import { useMemo } from 'react';

import { useDraftActions, useDraftBlock, useSiteYdoc } from '../../../draft/SiteDraftContext';
import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { Field, SectionHeading } from '../common/Field';
import { RichTextEditor } from '../common/RichTextEditorLazy';

export function AboutSectionEditor({ blockId }: { blockId: string }) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const ydoc = useSiteYdoc();
  const { setBlockField } = useDraftActions();
  const block = useDraftBlock(blockId, 'about');
  const fragment = useMemo(() => getBlockFragment(ydoc, blockId), [ydoc, blockId]);
  if (!block) return null;
  const titlePath = `blocks.${blockId}.title`;
  const contentPath = `blocks.${blockId}.content`;

  return (
    <div>
      <SectionHeading>Über mich</SectionHeading>

      <Field panel={blockId} path={titlePath} htmlFor={`${blockId}-title`} label="Titel">
        <Input
          ref={(el) => registerField(titlePath, el)}
          id={`${blockId}-title`}
          value={block.title}
          onChange={(e) => setBlockField(blockId, 'about', { title: e.target.value })}
          onFocus={() => handleFieldFocus(blockId, titlePath)}
          onBlur={handleFieldBlur}
          placeholder="Wer ich bin"
          maxLength={SITE_SECTION_TITLE_MAX}
        />
      </Field>

      <Field panel={blockId} path={contentPath} htmlFor={`${blockId}-content`} label="Inhalt">
        <RichTextEditor
          id={`${blockId}-content`}
          fragment={fragment}
          onFocus={() => handleFieldFocus(blockId, contentPath)}
          onBlur={handleFieldBlur}
          placeholder="Erzähle etwas über dich, deinen Werdegang und deine Motivation..."
          maxLength={SITE_ABOUT_MAX_LENGTH}
          minHeight="200px"
        />
      </Field>
    </div>
  );
}
