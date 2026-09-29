import { type TransformedCollection } from '@gruenerator/contracts';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import { HiPencil } from 'react-icons/hi';

import { cn } from '../../../../utils/cn';

import { InlineText } from './InlineText';
import LabelsField from './LabelsField';

interface HubHeroProps {
  collection: TransformedCollection;
  total: number;
  canEdit: boolean;
  startEditingTitle: boolean;
  onSave: (patch: { name?: string; description?: string; labels?: string[] }) => void;
}

export function HubHero({ collection, total, canEdit, startEditingTitle, onSave }: HubHeroProps) {
  const description = collection.description ?? '';
  const updated = formatRelativeTime(collection.updated_at);

  return (
    <div className="flex flex-col items-center gap-sm pt-sm text-center md:pt-xl">
      <h1 className="m-0 w-full text-[clamp(1.75rem,5vw,2.75rem)] leading-tight font-bold text-balance text-foreground-heading">
        <InlineText
          value={collection.name}
          label="Namen bearbeiten"
          maxLength={100}
          startEditing={startEditingTitle}
          disabled={!canEdit}
          onSave={(name) => name && onSave({ name })}
          inputClassName="border-b-2 border-secondary-600 font-bold"
        >
          <span className="min-w-0">{collection.name}</span>
          {canEdit ? (
            <HiPencil
              aria-hidden
              className="size-4 shrink-0 text-grey-400 opacity-60 group-hover:opacity-100"
            />
          ) : null}
        </InlineText>
      </h1>

      <div className="w-full max-w-[40rem]">
        <InlineText
          value={description}
          label="Beschreibung bearbeiten"
          multiline
          maxLength={500}
          placeholder="Worum geht es in diesem Notebook?"
          disabled={!canEdit}
          onSave={(next) => onSave({ description: next })}
          inputClassName="resize-none rounded-lg border border-secondary-600 px-sm py-xs text-base"
        >
          <span
            className={cn(
              'text-base leading-relaxed text-pretty',
              description ? 'text-grey-500 dark:text-grey-400' : 'text-secondary-600 italic'
            )}
          >
            {description || (canEdit ? 'Beschreibung hinzufügen…' : '')}
          </span>
        </InlineText>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-xs">
        {canEdit ? (
          <LabelsField labels={collection.labels ?? []} onChange={(labels) => onSave({ labels })} />
        ) : null}
        <span className="text-sm text-grey-500">
          · {total === 1 ? '1 Quelle' : `${total} Quellen`}
          {updated ? ` · zuletzt ${updated}` : ''}
        </span>
      </div>
    </div>
  );
}
