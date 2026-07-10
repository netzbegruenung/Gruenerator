/**
 * Global search palette (Cmd/Ctrl+K, or the sidebar entry under Workplace).
 *
 * Features and agents match client-side and render on the first keystroke;
 * chats, documents, sharepics, images and notebooks arrive from the single
 * `/api/global-search` request.
 *
 * `shouldFilter={false}`: cmdk's built-in filter would re-filter server hits
 * against the raw input and drop anything matched on content rather than
 * title — the backend already decided what matches.
 */
import { type GlobalSearchItem } from '@gruenerator/contracts';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useUserAgents } from '../agents/api';

import { buildFeatureIndex, matchFeatures } from './featureIndex';
import { MIN_QUERY_LENGTH, useGlobalSearch } from './useGlobalSearch';

import type { Agent } from '@gruenerator/shared/agents';

import { useAuthStore } from '@/stores/authStore';
import { resolveApiAssetUrl } from '@/utils/platform';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Stable reference: a `= []` default would rebuild the index on every render. */
const NO_AGENTS: Agent[] = [];

const CATEGORY_LABELS: Record<string, string> = {
  chats: 'Chats',
  docs: 'Dokumente',
  canvases: 'Sharepics',
  media: 'Bilder & Medien',
  notebooks: 'Notebooks',
};

function ResultRow({ item, onSelect }: { item: GlobalSearchItem; onSelect: () => void }) {
  return (
    <CommandItem value={`${item.type}:${item.id}`} onSelect={onSelect}>
      {item.thumbnailUrl ? (
        // Desktop app runs on a tauri:// origin — a bare /api path would 404.
        <img
          src={resolveApiAssetUrl(item.thumbnailUrl)}
          alt=""
          className="size-8 shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <span className="size-8 shrink-0 rounded bg-grey-100 dark:bg-grey-800" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{item.title}</span>
        {item.subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
        )}
      </span>
    </CommandItem>
  );
}

export default function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const navigate = useNavigate();
  const [input, setInput] = useState('');

  const locale = useAuthStore((state) => state.locale);
  const { data: userAgents = NO_AGENTS } = useUserAgents();

  const featureIndex = useMemo(
    () => buildFeatureIndex({ isAustrian: locale === 'de-AT', locale, userAgents }),
    [locale, userAgents]
  );
  const featureHits = useMemo(() => matchFeatures(featureIndex, input), [featureIndex, input]);

  const { data, isSearching } = useGlobalSearch(input, open);

  // Reset on every close, not just on selection — otherwise dismissing with
  // Escape leaves the query behind and reopening re-runs the stale search.
  const handleOpenChange = (next: boolean) => {
    if (!next) setInput('');
    onOpenChange(next);
  };

  const go = (path: string) => {
    handleOpenChange(false);
    void navigate(path);
  };

  const categories = data
    ? (Object.entries(data.results) as Array<[string, GlobalSearchItem[]]>).filter(
        ([, items]) => items.length > 0
      )
    : [];

  const tooShort = input.trim().length < MIN_QUERY_LENGTH;
  const hasResults = featureHits.length > 0 || categories.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Suche</DialogTitle>
          <DialogDescription>
            Durchsuche Funktionen, Chats, Dokumente, Sharepics, Bilder und Notebooks.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Alles durchsuchen …"
            value={input}
            onValueChange={setInput}
            autoFocus
          />
          <CommandList>
            {tooShort ? (
              <CommandEmpty>Mindestens {MIN_QUERY_LENGTH} Zeichen eingeben.</CommandEmpty>
            ) : !hasResults ? (
              <CommandEmpty>{isSearching ? 'Suche läuft …' : 'Keine Treffer.'}</CommandEmpty>
            ) : null}

            {featureHits.length > 0 && (
              <CommandGroup heading="Funktionen">
                {featureHits.map((hit) => (
                  <CommandItem key={hit.key} value={hit.key} onSelect={() => go(hit.path)}>
                    {hit.icon ? (
                      <hit.icon aria-hidden="true" className="size-4 shrink-0" />
                    ) : (
                      <span className="size-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{hit.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {categories.map(([category, items]) => (
              <CommandGroup key={category} heading={CATEGORY_LABELS[category] ?? category}>
                {items.map((item) => (
                  <ResultRow key={item.id} item={item} onSelect={() => go(item.url)} />
                ))}
              </CommandGroup>
            ))}

            {data && data.failedCategories.length > 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Einige Bereiche konnten nicht durchsucht werden (
                {data.failedCategories.map((c) => CATEGORY_LABELS[c] ?? c).join(', ')}).
              </div>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
