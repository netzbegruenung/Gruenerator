import {
  SITE_ACTION_TEXT_MAX,
  SITE_ACTIONS_MAX,
  SITE_URL_MAX,
  type SiteDraft,
} from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { Button, Input } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';
import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { useEditorStore } from '../../../stores/editorStore';
import { AddItemButton } from '../common/AddItemButton';
import { Field, SectionHeading } from '../common/Field';
import { FocalPointPicker } from '../common/FocalPointPicker';
import { ImageUpload } from '../common/ImageUpload';
import { ItemControls } from '../common/ItemControls';

const LINK_SUGGESTIONS = [
  { label: 'Spenden', link: '#spenden' },
  { label: 'Newsletter', link: '#newsletter' },
  { label: 'Mitglied werden', link: 'https://gruene.de/mitglied-werden' },
  { label: 'Kontakt', link: '#kontakt' },
];

interface ActionTileEditorProps {
  blockId: string;
  id: string;
  index: number;
  count: number;
}

function actionTile(d: SiteDraft, blockId: string, id: string) {
  const block = d.blocks.find((entry) => entry.id === blockId);
  return block?.type === 'actions' ? block.items.find((item) => item.id === id) : undefined;
}

function ActionTileEditor({ blockId, id, index, count }: ActionTileEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const { updateItem, removeItem, moveItem } = useDraftActions();
  const text = useDraft((d) => actionTile(d, blockId, id)?.text ?? '');
  const link = useDraft((d) => actionTile(d, blockId, id)?.link ?? '');
  const imageUrl = useDraft((d) => actionTile(d, blockId, id)?.imageUrl ?? '');
  const imageFocus = useDraft((d) => actionTile(d, blockId, id)?.imageFocus ?? null);
  const base = `blocks.${blockId}.items.${id}`;
  const highlighted = useEditorStore(
    (s) =>
      s.highlightedElement?.panel === blockId && s.highlightedElement.path.startsWith(`${base}.`)
  );
  const name = text || `Aktion ${index + 1}`;

  return (
    <div
      className={cn(
        'bg-background-pure border border-grey-200 dark:border-grey-700 rounded-lg p-md relative',
        highlighted && 'border-primary-400 shadow-[0_0_0_2px_rgba(76,175,80,0.2)]'
      )}
    >
      <div className="flex items-center justify-between mb-sm">
        <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
          Aktion {index + 1}
        </span>
        <ItemControls
          kind="Aktion"
          name={name}
          canMoveUp={index > 0}
          canMoveDown={index < count - 1}
          canRemove={count > 1}
          onMoveUp={() => moveItem(blockId, id, index - 1)}
          onMoveDown={() => moveItem(blockId, id, index + 1)}
          onRemove={() => removeItem(blockId, id)}
        />
      </div>

      <Field
        panel={blockId}
        path={`${base}.text`}
        htmlFor={`action-${id}-text`}
        label="Button-Text"
      >
        <Input
          ref={(el) => registerField(`${base}.text`, el)}
          id={`action-${id}-text`}
          value={text}
          onChange={(e) => updateItem(blockId, id, { text: e.target.value })}
          onFocus={() => handleFieldFocus(blockId, `${base}.text`)}
          onBlur={handleFieldBlur}
          placeholder="z.B. Unterstütze uns!"
          maxLength={SITE_ACTION_TEXT_MAX}
        />
      </Field>

      <Field panel={blockId} path={`${base}.link`} htmlFor={`action-${id}-link`} label="Link">
        <Input
          ref={(el) => registerField(`${base}.link`, el)}
          id={`action-${id}-link`}
          type="url"
          value={link}
          onChange={(e) => updateItem(blockId, id, { link: e.target.value })}
          onFocus={() => handleFieldFocus(blockId, `${base}.link`)}
          onBlur={handleFieldBlur}
          placeholder="https://... oder #section"
          maxLength={SITE_URL_MAX}
        />
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {LINK_SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion.link}
              type="button"
              size="xs"
              variant={link === suggestion.link ? 'secondary' : 'outline'}
              aria-pressed={link === suggestion.link}
              onClick={() => updateItem(blockId, id, { link: suggestion.link })}
            >
              {suggestion.label}
            </Button>
          ))}
        </div>
      </Field>

      <Field
        panel={blockId}
        path={`${base}.imageUrl`}
        labelId={`action-${id}-image-label`}
        label="Hintergrundbild"
      >
        <ImageUpload
          labelledBy={`action-${id}-image-label`}
          value={imageUrl}
          onChange={(url) => updateItem(blockId, id, { imageUrl: url })}
          aspectRatio="16/9"
          placeholder="Aktionsbild"
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

export function ActionsSectionEditor({ blockId }: { blockId: string }) {
  const { addItem } = useDraftActions();
  const ids = useDraft((d) => {
    const block = d.blocks.find((entry) => entry.id === blockId);
    return block?.type === 'actions' ? block.items.map((item) => item.id) : [];
  });

  return (
    <div>
      <SectionHeading>Aktionen</SectionHeading>

      <p className="text-xs text-grey-500 dark:text-grey-400 mt-1 mb-md">
        Call-to-Action Kacheln, die Besucher zum Handeln auffordern.
      </p>

      <div className="flex flex-col gap-md mb-md">
        {ids.map((id, index) => (
          <ActionTileEditor key={id} blockId={blockId} id={id} index={index} count={ids.length} />
        ))}
      </div>

      <AddItemButton
        label="Aktion"
        disabled={ids.length >= SITE_ACTIONS_MAX}
        onAdd={() => addItem(blockId)}
      />
    </div>
  );
}
