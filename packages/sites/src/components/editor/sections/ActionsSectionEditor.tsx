import { SITE_ACTION_TEXT_MAX, SITE_ACTIONS_MAX, SITE_URL_MAX } from '@gruenerator/contracts';
import { cn } from '@gruenerator/shared/utils';
import { Button, Input } from '@gruenerator/ui';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';
import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { useEditorStore } from '../../../stores/editorStore';
import { AddItemButton } from '../common/AddItemButton';
import { Field, SectionHeading } from '../common/Field';
import { ImageUpload } from '../common/ImageUpload';
import { ItemControls } from '../common/ItemControls';

const LINK_SUGGESTIONS = [
  { label: 'Spenden', link: '#spenden' },
  { label: 'Newsletter', link: '#newsletter' },
  { label: 'Mitglied werden', link: 'https://gruene.de/mitglied-werden' },
  { label: 'Kontakt', link: '#kontakt' },
];

interface ActionTileEditorProps {
  id: string;
  index: number;
  count: number;
}

function ActionTileEditor({ id, index, count }: ActionTileEditorProps) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const { updateAction, removeAction, moveAction } = useDraftActions();
  const text = useDraft((d) => d.actions.find((action) => action.id === id)?.text ?? '');
  const link = useDraft((d) => d.actions.find((action) => action.id === id)?.link ?? '');
  const imageUrl = useDraft((d) => d.actions.find((action) => action.id === id)?.imageUrl ?? '');
  const base = `sections.actions.${index}`;
  const highlighted = useEditorStore(
    (s) =>
      s.highlightedElement?.panel === 'actions' && s.highlightedElement.path.startsWith(`${base}.`)
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
          onMoveUp={() => moveAction(id, index - 1)}
          onMoveDown={() => moveAction(id, index + 1)}
          onRemove={() => removeAction(id)}
        />
      </div>

      <Field
        panel="actions"
        path={`${base}.text`}
        htmlFor={`action-${id}-text`}
        label="Button-Text"
      >
        <Input
          ref={(el) => registerField(`${base}.text`, el)}
          id={`action-${id}-text`}
          value={text}
          onChange={(e) => updateAction(id, { text: e.target.value })}
          onFocus={() => handleFieldFocus('actions', `${base}.text`)}
          onBlur={handleFieldBlur}
          placeholder="z.B. Unterstütze uns!"
          maxLength={SITE_ACTION_TEXT_MAX}
        />
      </Field>

      <Field panel="actions" path={`${base}.link`} htmlFor={`action-${id}-link`} label="Link">
        <Input
          ref={(el) => registerField(`${base}.link`, el)}
          id={`action-${id}-link`}
          type="url"
          value={link}
          onChange={(e) => updateAction(id, { link: e.target.value })}
          onFocus={() => handleFieldFocus('actions', `${base}.link`)}
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
              onClick={() => updateAction(id, { link: suggestion.link })}
            >
              {suggestion.label}
            </Button>
          ))}
        </div>
      </Field>

      <Field
        panel="actions"
        path={`${base}.imageUrl`}
        htmlFor={`action-${id}-image`}
        label="Hintergrundbild"
      >
        <ImageUpload
          id={`action-${id}-image`}
          value={imageUrl}
          onChange={(url) => updateAction(id, { imageUrl: url })}
          aspectRatio="16/9"
          placeholder="Aktionsbild"
        />
      </Field>
    </div>
  );
}

export function ActionsSectionEditor() {
  const { addAction } = useDraftActions();
  const ids = useDraft((d) => d.actions.map((action) => action.id));

  return (
    <div>
      <SectionHeading>Aktionen</SectionHeading>

      <p className="text-xs text-grey-500 dark:text-grey-400 mt-1 mb-md">
        Call-to-Action Kacheln, die Besucher zum Handeln auffordern.
      </p>

      <div className="flex flex-col gap-md mb-md">
        {ids.map((id, index) => (
          <ActionTileEditor key={id} id={id} index={index} count={ids.length} />
        ))}
      </div>

      <AddItemButton
        label="Aktion"
        disabled={ids.length >= SITE_ACTIONS_MAX}
        onAdd={() => addAction()}
      />
    </div>
  );
}
