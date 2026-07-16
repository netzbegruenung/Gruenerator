/**
 * Global search palette (Cmd/Ctrl+K, or the sidebar entry under Workplace).
 *
 * Features, tools and agents match client-side and render on the first
 * keystroke; chats, documents, sharepics, images and notebooks arrive from the
 * single `/api/global-search` request.
 *
 * `shouldFilter={false}`: cmdk's built-in filter would re-filter server hits
 * against the raw input and drop anything matched on content rather than
 * title — matching is decided by matchFeatures and the backend.
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

import { getIcon } from '../../config/icons';

import { matchFeatures } from './featureIndex';
import { useFeatureIndex } from './useFeatureIndex';
import { MIN_QUERY_LENGTH, useGlobalSearch } from './useGlobalSearch';

import { resolveApiAssetUrl } from '@/utils/platform';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NewChatIcon = getIcon('actions', 'edit');

const CATEGORY_LABELS: Record<string, string> = {
  chats: 'Chats',
  docs: 'Dokumente',
  canvases: 'Sharepics',
  media: 'Bilder & Medien',
  notebooks: 'Notebooks',
};

// A roomy, monochrome row — the shared shape for every palette entry.
const ROW = 'gap-3 rounded-xl px-3 py-2.5';
const ICON_CHIP =
  'flex size-9 flex-none items-center justify-center rounded-lg bg-hover-alt text-muted-foreground';

function ResultRow({ item, onSelect }: { item: GlobalSearchItem; onSelect: () => void }) {
  return (
    <CommandItem value={`${item.type}:${item.id}`} onSelect={onSelect} className={ROW}>
      {item.thumbnailUrl ? (
        // Desktop app runs on a tauri:// origin — a bare /api path would 404.
        <img
          src={resolveApiAssetUrl(item.thumbnailUrl)}
          alt=""
          className="size-9 flex-none rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <span className={ICON_CHIP} aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{item.title}</span>
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

  const featureIndex = useFeatureIndex();
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
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Suche</DialogTitle>
          <DialogDescription>
            Durchsuche Funktionen, Tools, Chats, Dokumente, Sharepics, Bilder und Notebooks.
          </DialogDescription>
        </DialogHeader>
        {/* Tall, borderless input with no leading glyph — the × is DialogContent's own. */}
        <Command
          shouldFilter={false}
          className="[&_[data-slot=command-input]]:text-base [&_[data-slot=command-input-wrapper]]:h-16 [&_[data-slot=command-input-wrapper]]:px-5 [&_[data-slot=command-input-wrapper]>svg]:hidden"
        >
          <CommandInput placeholder="Suchen …" value={input} onValueChange={setInput} autoFocus />
          <CommandList className="max-h-[min(70vh,32rem)] scroll-py-2 p-2">
            <CommandGroup>
              <CommandItem value="__new-chat" onSelect={() => go('/chat')} className={ROW}>
                <span className={ICON_CHIP}>
                  {NewChatIcon && <NewChatIcon aria-hidden="true" className="size-[18px]" />}
                </span>
                <span className="text-sm font-medium text-foreground">Neuer Chat</span>
              </CommandItem>
            </CommandGroup>

            {!tooShort && !hasResults && (
              <CommandEmpty className="py-10">
                {isSearching ? 'Suche läuft …' : 'Keine Treffer.'}
              </CommandEmpty>
            )}

            {featureHits.length > 0 && (
              <CommandGroup heading="Funktionen & Tools">
                {featureHits.map((hit) => (
                  <CommandItem
                    key={hit.key}
                    value={hit.key}
                    onSelect={() => go(hit.path)}
                    className={ROW}
                  >
                    <span className={ICON_CHIP}>
                      {hit.icon && <hit.icon aria-hidden="true" className="size-[18px]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{hit.title}</span>
                      {hit.subtitle && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {hit.subtitle}
                        </span>
                      )}
                    </span>
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
