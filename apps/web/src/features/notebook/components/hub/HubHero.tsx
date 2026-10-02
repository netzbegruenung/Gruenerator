import { type TransformedCollection } from '@gruenerator/contracts';
import { HiPencil } from 'react-icons/hi';

import { cn } from '../../../../utils/cn';

import { InlineText } from './InlineText';
import LabelsField from './LabelsField';

import type { ReactNode } from 'react';

interface HubHeroProps {
  collection: TransformedCollection;
  canEdit: boolean;
  startEditingTitle: boolean;
  onSave: (patch: { name?: string; description?: string; labels?: string[] }) => void;
  /** Icon-Leiste rechts neben dem Titel. */
  toolbar?: ReactNode;
  /** Rechts in der Label-Zeile, z. B. „+ Dateien hochladen". */
  actions?: ReactNode;
}

export function HubHero({
  collection,
  canEdit,
  startEditingTitle,
  onSave,
  toolbar,
  actions,
}: HubHeroProps) {
  const description = collection.description ?? '';

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-start justify-between gap-md">
        <div className="-ml-sm flex min-w-0 flex-1 flex-col items-start gap-1">
          <h1 className="m-0 w-full text-[clamp(1.375rem,3vw,1.75rem)] leading-tight font-bold text-balance text-foreground-heading">
            <InlineText
              value={collection.name}
              label="Namen bearbeiten"
              maxLength={100}
              startEditing={startEditingTitle}
              disabled={!canEdit}
              onSave={(name) => name && onSave({ name })}
              inputClassName="max-w-[40rem] border-b-2 border-secondary-600 px-sm font-bold"
            >
              <span className="min-w-0">{collection.name}</span>
              {canEdit ? (
                <HiPencil
                  aria-hidden
                  className="size-[15px] shrink-0 text-grey-400 opacity-60 group-hover:opacity-100"
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
              inputClassName="resize-none rounded-md border border-secondary-600 px-sm py-1 text-sm"
            >
              <span
                className={cn(
                  'text-sm leading-relaxed text-pretty',
                  description ? 'text-grey-500 dark:text-grey-400' : 'text-secondary-600 italic'
                )}
              >
                {description || (canEdit ? 'Beschreibung hinzufügen…' : '')}
              </span>
            </InlineText>
          </div>
        </div>
        {toolbar}
      </div>

      {canEdit || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-xs">
          {canEdit ? (
            <LabelsField
              labels={collection.labels ?? []}
              onChange={(labels) => onSave({ labels })}
            />
          ) : (
            <span />
          )}
          {actions ? <div className="flex items-center gap-xs">{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
