import {
  SITE_SECTION_TITLE_MAX,
  SITE_THEME_CONTENT_MAX_LENGTH,
  SITE_THEMES_MAX,
} from '@gruenerator/contracts';
import { getThemeFragment } from '@gruenerator/contracts/site-ydoc';
import { cn } from '@gruenerator/shared/utils';
import { Input } from '@gruenerator/ui';
import { useMemo } from 'react';

import { useDraft, useDraftActions, useSiteYdoc } from '../../../draft/SiteDraftContext';
import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { useEditorStore } from '../../../stores/editorStore';
import { AddItemButton } from '../common/AddItemButton';
import { Field, SectionHeading } from '../common/Field';
import { ImageUpload } from '../common/ImageUpload';
import { ItemControls } from '../common/ItemControls';
import { RichTextEditor } from '../common/RichTextEditorLazy';

interface ThemeCardEditorProps {
  id: string;
  index: number;
  count: number;
}

function ThemeCardEditor({ id, index, count }: ThemeCardEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const ydoc = useSiteYdoc();
  const { updateTheme, removeTheme, moveTheme } = useDraftActions();
  const title = useDraft((d) => d.themes.find((theme) => theme.id === id)?.title ?? '');
  const imageUrl = useDraft((d) => d.themes.find((theme) => theme.id === id)?.imageUrl ?? '');
  const highlighted = useEditorStore(
    (s) =>
      s.highlightedElement?.section === 'themes' &&
      (s.highlightedElement.field ?? '').startsWith(`sections.themes.${index}.`)
  );
  const fragment = useMemo(() => getThemeFragment(ydoc, id), [ydoc, id]);
  const base = `sections.themes.${index}`;
  const name = title || `Thema ${index + 1}`;

  return (
    <div
      className={cn(
        'bg-background-pure border border-grey-200 dark:border-grey-700 rounded-lg p-md relative',
        highlighted && 'border-primary-400 shadow-[0_0_0_2px_rgba(76,175,80,0.2)]'
      )}
    >
      <div className="flex items-center justify-between mb-sm">
        <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
          Thema {index + 1}
        </span>
        <ItemControls
          kind="Thema"
          name={name}
          canMoveUp={index > 0}
          canMoveDown={index < count - 1}
          canRemove={count > 1}
          onMoveUp={() => moveTheme(id, index - 1)}
          onMoveDown={() => moveTheme(id, index + 1)}
          onRemove={() => removeTheme(id)}
        />
      </div>

      <Field panel="themes" path={`${base}.title`} htmlFor={`theme-${id}-title`} label="Titel">
        <Input
          ref={(el) => registerField('themes', `${base}.title`, el)}
          id={`theme-${id}-title`}
          value={title}
          onChange={(e) => updateTheme(id, { title: e.target.value })}
          onFocus={() => handleFieldFocus('themes', `${base}.title`)}
          onBlur={handleFieldBlur}
          placeholder="z.B. Klimaschutz"
          maxLength={SITE_SECTION_TITLE_MAX}
        />
      </Field>

      <Field
        panel="themes"
        path={`${base}.content`}
        htmlFor={`theme-${id}-content`}
        label="Beschreibung"
      >
        <RichTextEditor
          id={`theme-${id}-content`}
          fragment={fragment}
          onFocus={() => handleFieldFocus('themes', `${base}.content`)}
          onBlur={handleFieldBlur}
          placeholder="Beschreibe dein Engagement für dieses Thema..."
          maxLength={SITE_THEME_CONTENT_MAX_LENGTH}
          minHeight="120px"
        />
      </Field>

      <Field panel="themes" path={`${base}.imageUrl`} htmlFor={`theme-${id}-image`} label="Bild">
        <ImageUpload
          id={`theme-${id}-image`}
          value={imageUrl}
          onChange={(url) => updateTheme(id, { imageUrl: url })}
          aspectRatio="4/3"
          placeholder="Themenbild"
        />
      </Field>
    </div>
  );
}

export function ThemesSectionEditor() {
  const { addTheme } = useDraftActions();
  const ids = useDraft((d) => d.themes.map((theme) => theme.id));

  return (
    <div>
      <SectionHeading>Meine Themen</SectionHeading>

      <p className="text-xs text-grey-500 dark:text-grey-400 mt-1 mb-md">
        Füge bis zu {SITE_THEMES_MAX} politische Schwerpunktthemen hinzu.
      </p>

      <div className="flex flex-col gap-md mb-md">
        {ids.map((id, index) => (
          <ThemeCardEditor key={id} id={id} index={index} count={ids.length} />
        ))}
      </div>

      <AddItemButton
        label="Thema"
        disabled={ids.length >= SITE_THEMES_MAX}
        onAdd={() => addTheme()}
      />
    </div>
  );
}
