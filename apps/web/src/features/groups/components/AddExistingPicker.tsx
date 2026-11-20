import { type GroupContentType } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { type AddableItem, addItemsToGroup, addableKey } from '@gruenerator/shared/groups';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@gruenerator/ui';
import { useQueries } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { type IconType } from 'react-icons';
import { FiGrid, FiMonitor } from 'react-icons/fi';
import { HiDocumentText } from 'react-icons/hi';
import { PiNotebook, PiPaperclip, PiRobot, PiSquaresFour } from 'react-icons/pi';

import { ICONS } from '../../../config/icons';
import { profileApiService } from '../../auth/services/profileApiService';
import { subtypeToKind } from '../../docs/docTypeMeta';
import { SYSTEM_NOTEBOOKS } from '../../notebook/config/notebooksConfig';

import { cn } from '@/utils/cn';

type Kind = 'doc' | 'sheet' | 'pres' | 'board' | 'agent' | 'recipe' | 'notebook' | 'file';

const KIND: Record<Kind, { label: string; icon: IconType }> = {
  doc: { label: 'Doc', icon: HiDocumentText },
  sheet: { label: 'Sheet', icon: FiGrid as IconType },
  pres: { label: 'Präsentation', icon: FiMonitor as IconType },
  board: { label: 'Board', icon: PiSquaresFour as IconType },
  agent: { label: 'Agent', icon: PiRobot as IconType },
  recipe: { label: 'Rezept', icon: PiNotebook as IconType },
  notebook: { label: 'Notebook', icon: ICONS.actions.notebook as IconType },
  file: { label: 'Datei', icon: PiPaperclip as IconType },
};

interface PickerItem extends AddableItem {
  kind: Kind;
  changedAt: string | null;
}

/** Ohne Suchbegriff: so viele zuletzt geänderte Inhalte. */
const RECENT_COUNT = 8;

// Die Listen kommen aus verschiedenen Endpunkten und benennen das Datum je verschieden;
// Agents tragen gar keins.
function changedAtOf(row: object): string | null {
  const r = row as Record<string, unknown>;
  const value = r.updated_at ?? r.updatedAt ?? r.created_at ?? r.createdAt;
  return typeof value === 'string' ? value : null;
}

const thisYear = new Date().getFullYear();
const shortDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const withTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

function formatChanged(value: string | null, showTime = false): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = (date.getFullYear() === thisYear ? shortDate : longDate).format(date);
  return showTime ? `${day}, ${withTime.format(date)}` : day;
}

/**
 * Das Datum je Zeile. Tragen zwei sichtbare Zeilen denselben Titel und dasselbe Datum,
 * bekommen beide die Uhrzeit dazu — sonst wären sie nicht zu unterscheiden.
 */
function changedLabels(items: readonly PickerItem[]): Map<string, string | null> {
  const dayKey = (i: PickerItem) => `${i.title}\u0000${formatChanged(i.changedAt) ?? ''}`;
  const count = new Map<string, number>();
  for (const i of items) if (i.changedAt) count.set(dayKey(i), (count.get(dayKey(i)) ?? 0) + 1);
  return new Map(
    items.map((i) => [addableKey(i), formatChanged(i.changedAt, (count.get(dayKey(i)) ?? 0) > 1)])
  );
}

const item = (
  contentType: GroupContentType,
  kind: Kind,
  id: string | number,
  title: string | null | undefined,
  changedAt: string | null
): PickerItem => ({ contentType, kind, id: String(id), title: title || 'Ohne Titel', changedAt });

interface AddExistingPickerProps {
  groupId: string;
  /** `addableKey` aller Inhalte, die schon im Projekt liegen (`sharedContentKeys(feed)`). */
  sharedKeys: ReadonlySet<string>;
  /** Der Server teilt nur Eigenes; fremde Docs, Boards und Notebooks gar nicht erst anbieten. */
  currentUserId: string | null;
  /** Notiz für den Feed, etwa der Text aus dem Composer. */
  note?: string | null;
  /**
   * `items` kamen an. `done`: nichts schlug fehl — der Host schließt dann. Sonst stehen
   * die Fehler an ihren Zeilen, und der Picker bleibt offen.
   */
  onAdded: (items: PickerItem[], done: boolean) => void;
}

/**
 * „Vorhandenes hinzufügen“: ein Klick fügt einen Inhalt hinzu. Mehrere gehen mit
 * ⌘/Strg- oder Shift-Klick (bzw. Shift+Enter); erst dann erscheint ein Knopf.
 */
export function AddExistingPicker({
  groupId,
  sharedKeys,
  currentUserId,
  note = null,
  onAdded,
}: AddExistingPickerProps) {
  const [query, setQuery] = useState('');
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // cmdk ruft `onSelect` ohne Ereignis; ob ⌘/Strg/Shift gedrückt war, merkt sich die Hülle.
  const withModifier = useRef(false);

  const own = (owner: unknown) => !currentUserId || owner === currentUserId;

  const queries = useQueries({
    queries: [
      {
        queryKey: ['add-to-group', 'agents'],
        queryFn: async (): Promise<PickerItem[]> => {
          const res = await getContractsClient().userAgents.list();
          if (res.status !== 200) return [];
          return res.body.agents.flatMap((a) =>
            a.id ? [item('user_agents', 'agent', a.id, a.title, changedAtOf(a))] : []
          );
        },
      },
      {
        // Ohne Projekt-Geteiltes und ohne angepasste System-Rezepte — die darf man nicht teilen.
        queryKey: ['add-to-group', 'recipes'],
        queryFn: async (): Promise<PickerItem[]> => {
          const res = await getContractsClient().userTextForms.list();
          if (res.status !== 200) return [];
          return res.body.forms
            .filter((f) => f.kind === 'custom' && f.sharedFromGroup === null)
            .map((f) => item('user_text_forms', 'recipe', f.id, f.title, changedAtOf(f)));
        },
      },
      {
        queryKey: ['add-to-group', 'collabDocs'],
        queryFn: async (): Promise<PickerItem[]> => {
          const res = await getContractsClient().docs.listDocuments({ query: {} });
          if (res.status !== 200) return [];
          // Boards kommen aus `listBoards`, Sharepics gehören nicht hierher.
          return res.body.flatMap((d) => {
            const kind = subtypeToKind(d.document_subtype);
            if (!own(d.created_by) || (kind !== 'doc' && kind !== 'sheet' && kind !== 'pres'))
              return [];
            return [item('collaborative_documents', kind, d.id, d.title, d.updated_at)];
          });
        },
      },
      {
        queryKey: ['add-to-group', 'boards'],
        queryFn: async (): Promise<PickerItem[]> => {
          const res = await getContractsClient().boards.listBoards();
          if (res.status !== 200) return [];
          return res.body
            .filter((b) => own(b.created_by))
            .map((b) => item('collaborative_documents', 'board', b.id, b.title, b.updated_at));
        },
      },
      {
        queryKey: ['add-to-group', 'documents'],
        queryFn: async (): Promise<PickerItem[]> =>
          (await profileApiService.getAvailableDocuments()).map((d) =>
            item(
              'documents',
              'file',
              d.id,
              (typeof d.title === 'string' && d.title) ||
                (typeof d.filename === 'string' ? d.filename : null),
              changedAtOf(d)
            )
          ),
      },
      {
        queryKey: ['add-to-group', 'notebooks'],
        queryFn: async (): Promise<PickerItem[]> => {
          const own_ = (await profileApiService.getNotebookCollections())
            .filter((n) => own(n.user_id))
            .map((n) => item('notebook_collections', 'notebook', n.id, n.name, changedAtOf(n)));
          const system = SYSTEM_NOTEBOOKS.map((nb) =>
            item('system_notebooks', 'notebook', nb.id, nb.title, null)
          );
          return [...own_, ...system];
        },
      },
    ],
  });
  const isLoading = queries.some((q) => q.isLoading);

  const all = useMemo(
    () =>
      queries
        .flatMap((q) => q.data ?? [])
        .sort((a, b) => (b.changedAt ?? '').localeCompare(a.changedAt ?? '')),
    [queries]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // „Zuletzt bearbeitet“ nur mit Datum: Agents und System-Notebooks tragen keins
    // (System-Notebooks bearbeitet man nie selbst) und werden über die Suche gefunden.
    if (!q) return all.filter((i) => i.changedAt).slice(0, RECENT_COUNT);
    return all.filter(
      (i) => i.title.toLowerCase().includes(q) || KIND[i.kind].label.toLowerCase().includes(q)
    );
  }, [all, query]);
  const labels = useMemo(() => changedLabels(visible), [visible]);

  const markedItems = all.filter((i) => marked.has(addableKey(i)));

  async function add(items: PickerItem[]) {
    if (items.length === 0 || busy) return;
    setBusy(true);
    const result = await addItemsToGroup(groupId, items, note);
    setBusy(false);
    const failed = new Set(result.failures.map((f) => f.key));
    const added = items.filter((i) => !failed.has(addableKey(i)));
    setErrors((prev) => {
      const next = { ...prev };
      for (const i of added) delete next[addableKey(i)];
      for (const f of result.failures) next[f.key] = f.message;
      return next;
    });
    setMarked((prev) => new Set([...prev].filter((k) => failed.has(k))));
    if (added.length > 0) onAdded(added, result.failed === 0);
  }

  function pick(picked: PickerItem) {
    const key = addableKey(picked);
    if (withModifier.current || marked.size > 0) {
      setMarked((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    void add([picked]);
  }

  return (
    <div
      onPointerDownCapture={(e) => {
        withModifier.current = e.metaKey || e.ctrlKey || e.shiftKey;
      }}
      onKeyDownCapture={(e) => {
        if (e.key !== 'Enter') return;
        if ((e.metaKey || e.ctrlKey) && marked.size > 0) {
          e.preventDefault();
          e.stopPropagation();
          void add(markedItems);
          return;
        }
        withModifier.current = e.shiftKey;
      }}
    >
      <Command
        shouldFilter={false}
        loop
        label="Vorhandenes zum Projekt hinzufügen"
        className="rounded-none **:data-[slot=command-input-wrapper]:h-12 **:data-[slot=command-input-wrapper]:gap-3 **:data-[slot=command-input-wrapper]:px-3.5"
      >
        <CommandInput value={query} onValueChange={setQuery} placeholder="Inhalte suchen…" />
        <CommandList className="max-h-[304px] p-1.5 max-md:max-h-[60dvh]" aria-busy={busy}>
          {isLoading ? (
            <p className="m-0 p-2 text-sm text-muted-foreground">Lädt …</p>
          ) : (
            <CommandEmpty>Nichts gefunden.</CommandEmpty>
          )}
          <CommandGroup
            heading={query.trim() ? undefined : 'Zuletzt bearbeitet'}
            className="p-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-semibold"
          >
            {visible.map((i) => {
              const key = addableKey(i);
              const shared = sharedKeys.has(key);
              const isMarked = marked.has(key);
              const error = errors[key];
              const Icon = KIND[i.kind].icon;
              return (
                <CommandItem
                  key={key}
                  value={key}
                  disabled={shared || busy}
                  onSelect={() => pick(i)}
                  className="min-h-9 gap-3 rounded-md p-2 data-[disabled=true]:opacity-100 max-md:min-h-11"
                >
                  {isMarked ? (
                    <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-primary-600 text-white">
                      <Check className="size-3 text-white" strokeWidth={3} aria-hidden />
                    </span>
                  ) : (
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn('truncate text-sm', shared && 'text-muted-foreground')}>
                      <span className="sr-only">{KIND[i.kind].label}: </span>
                      {i.title}
                    </span>
                    {error && (
                      <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {shared ? 'Im Projekt' : labels.get(key)}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
        {marked.size > 0 && (
          <div className="flex items-center gap-3 border-t px-3.5 py-3">
            <span className="flex-1 text-xs text-muted-foreground">{marked.size} markiert</span>
            <Button variant="brand" size="sm" disabled={busy} onClick={() => void add(markedItems)}>
              {marked.size} hinzufügen
            </Button>
          </div>
        )}
      </Command>
    </div>
  );
}

export type { PickerItem };
