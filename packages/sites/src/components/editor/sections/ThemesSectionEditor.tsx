import {
  type SiteDraft,
  SITE_SECTION_TITLE_MAX,
  SITE_THEME_CONTENT_MAX_LENGTH,
  SITE_THEMES_MAX,
} from '@gruenerator/contracts';
import { getItemFragment } from '@gruenerator/contracts/site-ydoc';
import { cn } from '@gruenerator/shared/utils';
import { Input } from '@gruenerator/ui';
import { useMemo } from 'react';

import { useDraft, useDraftActions, useSiteYdoc } from '../../../draft/SiteDraftContext';
import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { useEditorStore } from '../../../stores/editorStore';
import { AddItemButton } from '../common/AddItemButton';
import { Field, SectionHeading } from '../common/Field';
import { FocalPointPicker } from '../common/FocalPointPicker';
import { ImageUpload } from '../common/ImageUpload';
import { ItemControls } from '../common/ItemControls';
import { RichTextEditor } from '../common/RichTextEditorLazy';

interface ThemeCardEditorProps {
  blockId: string;
  id: string;
  index: number;
  count: number;
}

function themeCard(d: SiteDraft, blockId: string, id: string) {
  const block = d.blocks.find((entry) => entry.id === blockId);
  return block?.type === 'themes' ? block.items.find((item) => item.id === id) : undefined;
}

function ThemeCardEditor({ blockId, id, index, count }: ThemeCardEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const ydoc = useSiteYdoc();
  const { updateItem, removeItem, moveItem } = useDraftActions();
  const title = useDraft((d) => themeCard(d, blockId, id)?.title ?? '');
  const imageUrl = useDraft((d) => themeCard(d, blockId, id)?.imageUrl ?? '');
  const imageFocus = useDraft((d) => themeCard(d, blockId, id)?.imageFocus ?? null);
  const base = `blocks.${blockId}.items.${id}`;
  const highlighted = useEditorStore(
    (s) =>
      s.highlightedElement?.panel === blockId && s.highlightedElement.path.startsWith(`${base}.`)
  );
  const fragment = useMemo(() => getItemFragment(ydoc, id), [ydoc, id]);
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
          onMoveUp={() => moveItem(blockId, id, index - 1)}
          onMoveDown={() => moveItem(blockId, id, index + 1)}
          onRemove={() => removeItem(blockId, id)}
        />
      </div>

      <Field panel={blockId} path={`${base}.title`} htmlFor={`theme-${id}-title`} label="Titel">
        <Input
          ref={(el) => registerField(`${base}.title`, el)}
          id={`theme-${id}-title`}
          value={title}
          onChange={(e) => updateItem(blockId, id, { title: e.target.value })}
          onFocus={() => handleFieldFocus(blockId, `${base}.title`)}
          onBlur={handleFieldBlur}
          placeholder="z.B. Klimaschutz"
          maxLength={SITE_SECTION_TITLE_MAX}
        />
      </Field>

      <Field
        panel={blockId}
        path={`${base}.content`}
        htmlFor={`theme-${id}-content`}
        label="Beschreibung"
      >
        <RichTextEditor
          id={`theme-${id}-content`}
          fragment={fragment}
          onFocus={() => handleFieldFocus(blockId, `${base}.content`)}
          onBlur={handleFieldBlur}
          placeholder="Beschreibe dein Engagement für dieses Thema..."
          maxLength={SITE_THEME_CONTENT_MAX_LENGTH}
          minHeight="120px"
        />
      </Field>

      <Field
        panel={blockId}
        path={`${base}.imageUrl`}
        labelId={`theme-${id}-image-label`}
        label="Bild"
      >
        <ImageUpload
          labelledBy={`theme-${id}-image-label`}
          value={imageUrl}
          onChange={(url) => updateItem(blockId, id, { imageUrl: url })}
          aspectRatio="4/3"
          placeholder="Themenbild"
        />
        {imageUrl && (
          <FocalPointPicker
            src={imageUrl}
            value={imageFocus}
            onChange={(focus) => updateItem(blockId, id, { imageFocus: focus })}
          />
        )}
      </Field>
    </div>
  );
}

export function ThemesSectionEditor({ blockId }: { blockId: string }) {
  const { addItem } = useDraftActions();
  const ids = useDraft((d) => {
    const block = d.blocks.find((entry) => entry.id === blockId);
    return block?.type === 'themes' ? block.items.map((item) => item.id) : [];
  });

  return (
    <div>
      <SectionHeading>Meine Themen</SectionHeading>

      <p className="text-xs text-grey-500 dark:text-grey-400 mt-1 mb-md">
        Füge bis zu {SITE_THEMES_MAX} politische Schwerpunktthemen hinzu.
      </p>

      <div className="flex flex-col gap-md mb-md">
        {ids.map((id, index) => (
          <ThemeCardEditor key={id} blockId={blockId} id={id} index={index} count={ids.length} />
        ))}
      </div>

      <AddItemButton
        label="Thema"
        disabled={ids.length >= SITE_THEMES_MAX}
        onAdd={() => addItem(blockId)}
      />
    </div>
  );
}
