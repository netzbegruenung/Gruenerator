import { type GlossaryDictionary, type GlossaryEntry } from '@gruenerator/contracts';
import { Alert, AlertDescription, Button, Input, Label, Skeleton } from '@gruenerator/ui';
import { useId, useMemo, useState } from 'react';
import { PiPlus, PiTrash } from 'react-icons/pi';

import {
  useDeleteDictionary,
  useGlossary,
  useSaveDictionary,
  useTranslationLanguagesForAdmin,
} from '../hooks/useGlossary';

/**
 * Das eine Konto-Glossar bei DeepL, Wörterbuch für Wörterbuch. Gespeichert
 * wird immer das ganze Sprachpaar (DeepL kennt kein Einzel-Update), und wer
 * zuletzt speichert, gewinnt — für eine Handvoll Admins reicht das.
 *
 * Glossare arbeiten auf Wurzelsprachen (`en`, nie `en-GB`); die Auswahl
 * zeigt darum nur Sprachen, die DeepL als glossarfähig meldet, und reduziert
 * sie auf die Wurzel.
 */
const NEW_PAIR = '__new__';
const selectCls =
  'h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function rootLang(code: string): string {
  return code.split('-')[0]!.toLowerCase();
}

interface RootLanguage {
  code: string;
  name: string;
}

interface Row extends GlossaryEntry {
  /** Stable per row so edits keep focus; entries have no natural id. */
  rowId: string;
}

let rowCounter = 0;
const toRow = (entry: GlossaryEntry): Row => ({ ...entry, rowId: `row-${rowCounter++}` });

export default function GlossarTab() {
  const glossary = useGlossary();
  const languages = useTranslationLanguagesForAdmin();

  const roots = useMemo<RootLanguage[]>(() => {
    const seen = new Map<string, string>();
    for (const l of languages.data?.languages ?? []) {
      if (!l.glossary) continue;
      const root = rootLang(l.code);
      if (!seen.has(root)) seen.set(root, l.name.replace(/\s*\(.*\)$/, ''));
    }
    return [...seen.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [languages.data]);

  if (glossary.isPending || languages.isPending) {
    return (
      <div className="flex flex-col gap-sm">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (glossary.isError || languages.isError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{(glossary.error ?? languages.error)?.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <GlossaryEditor
      key={glossary.dataUpdatedAt}
      name={glossary.data.name}
      exists={glossary.data.glossaryId !== null}
      dictionaries={glossary.data.dictionaries}
      roots={roots}
    />
  );
}

interface GlossaryEditorProps {
  name: string;
  exists: boolean;
  dictionaries: GlossaryDictionary[];
  roots: RootLanguage[];
}

/**
 * Remounted (via `key`) whenever the glossary is refetched, so the editor
 * state initialises from props instead of syncing through effects.
 */
function GlossaryEditor({ name, exists, dictionaries, roots }: GlossaryEditorProps) {
  const save = useSaveDictionary();
  const remove = useDeleteDictionary();
  const pairKeys = dictionaries.map((d) => `${d.sourceLang}>${d.targetLang}`);

  const [pair, setPair] = useState<string>(() => pairKeys[0] ?? NEW_PAIR);
  const [newSource, setNewSource] = useState('de');
  const [newTarget, setNewTarget] = useState('en');
  const [rows, setRows] = useState<Row[]>(() => rowsFor(pairKeys[0] ?? NEW_PAIR));
  const [dirty, setDirty] = useState(false);

  const pairId = useId();
  const sourceId = useId();
  const targetId = useId();

  function rowsFor(key: string): Row[] {
    const current = dictionaries.find((d) => `${d.sourceLang}>${d.targetLang}` === key);
    return current ? current.entries.map(toRow) : [];
  }

  const selectPair = (key: string) => {
    setPair(key);
    setRows(rowsFor(key));
    setDirty(false);
    save.reset();
    remove.reset();
  };

  const [sourceLang, targetLang] =
    pair === NEW_PAIR ? [newSource, newTarget] : (pair.split('>') as [string, string]);
  const langName = (code: string) => roots.find((r) => r.code === code)?.name ?? code.toUpperCase();

  const cleaned = rows
    .map((e) => ({ source: e.source.trim(), target: e.target.trim() }))
    .filter((e) => e.source || e.target);
  const incomplete = cleaned.some((e) => !e.source || !e.target);
  const duplicate = new Set(cleaned.map((e) => e.source.toLowerCase())).size !== cleaned.length;
  const validation =
    sourceLang === targetLang
      ? 'Quell- und Zielsprache müssen sich unterscheiden.'
      : incomplete
        ? 'Jede Zeile braucht Quelle und Ziel.'
        : duplicate
          ? 'Jeder Quellbegriff darf nur einmal vorkommen.'
          : cleaned.length === 0
            ? 'Mindestens ein Eintrag.'
            : null;

  const updateRow = (rowId: string, field: keyof GlossaryEntry, value: string) => {
    setRows((list) => list.map((e) => (e.rowId === rowId ? { ...e, [field]: value } : e)));
    setDirty(true);
  };

  const onSave = () => {
    if (validation) return;
    // The refetch after success remounts the editor on the saved pair.
    save.mutate({ sourceLang, targetLang, entries: cleaned });
  };

  const onDelete = () => {
    if (pair === NEW_PAIR) return;
    if (!window.confirm(`Wörterbuch ${langName(sourceLang)} → ${langName(targetLang)} löschen?`))
      return;
    remove.mutate({ sourceLang, targetLang });
  };

  const exportTsv = () => {
    const tsv = cleaned.map((e) => `${e.source}\t${e.target}`).join('\n');
    const url = URL.createObjectURL(new Blob([tsv], { type: 'text/tab-separated-values' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `glossar-${sourceLang}-${targetLang}.tsv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const error = save.error?.message ?? remove.error?.message ?? null;

  return (
    <div className="flex flex-col gap-md">
      <p className="m-0 text-sm text-grey-500">
        Glossar „{name}“ im DeepL-Konto{exists ? '' : ' — wird beim ersten Speichern angelegt'}. Die
        Begriffe werden bei jeder Übersetzung des Sprachpaars erzwungen, auf der Seite wie im Chat.
      </p>

      <div className="grid gap-sm md:grid-cols-3">
        <div className="flex flex-col gap-xs">
          <Label htmlFor={pairId}>Sprachpaar</Label>
          <select
            id={pairId}
            className={selectCls}
            value={pair}
            onChange={(e) => selectPair(e.target.value)}
          >
            {dictionaries.map((d) => (
              <option
                key={`${d.sourceLang}>${d.targetLang}`}
                value={`${d.sourceLang}>${d.targetLang}`}
              >
                {langName(d.sourceLang)} → {langName(d.targetLang)} ({d.entries.length})
              </option>
            ))}
            <option value={NEW_PAIR}>Neues Sprachpaar …</option>
          </select>
        </div>
        {pair === NEW_PAIR ? (
          <>
            <div className="flex flex-col gap-xs">
              <Label htmlFor={sourceId}>Von</Label>
              <select
                id={sourceId}
                className={selectCls}
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
              >
                {roots.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-xs">
              <Label htmlFor={targetId}>Nach</Label>
              <select
                id={targetId}
                className={selectCls}
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
              >
                {roots.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-xs" role="group" aria-label="Einträge">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-xs text-xs font-medium text-grey-500">
          <span>{langName(sourceLang)}</span>
          <span>{langName(targetLang)}</span>
          <span className="w-9" />
        </div>
        {rows.map((row, index) => (
          <div key={row.rowId} className="grid grid-cols-[1fr_1fr_auto] gap-xs">
            <Input
              aria-label={`Quelle ${index + 1}`}
              value={row.source}
              onChange={(e) => updateRow(row.rowId, 'source', e.target.value)}
            />
            <Input
              aria-label={`Ziel ${index + 1}`}
              value={row.target}
              onChange={(e) => updateRow(row.rowId, 'target', e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Zeile ${index + 1} entfernen`}
              onClick={() => {
                setRows((list) => list.filter((e) => e.rowId !== row.rowId));
                setDirty(true);
              }}
            >
              <PiTrash aria-hidden="true" />
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((list) => [...list, toRow({ source: '', target: '' })])}
          >
            <PiPlus aria-hidden="true" />
            Zeile hinzufügen
          </Button>
        </div>
      </div>

      {error || (dirty && validation) ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error ?? validation}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex gap-xs">
          {pair !== NEW_PAIR ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={exportTsv}
                disabled={cleaned.length === 0}
              >
                Als TSV exportieren
              </Button>
              <Button
                type="button"
                variant="brand-danger"
                size="sm"
                onClick={onDelete}
                disabled={remove.isPending}
              >
                Wörterbuch löschen
              </Button>
            </>
          ) : null}
        </div>
        <Button
          type="button"
          variant="brand"
          disabled={!!validation || save.isPending || (!dirty && pair !== NEW_PAIR)}
          onClick={onSave}
        >
          {save.isPending ? 'Speichere …' : 'Speichern'}
        </Button>
      </div>
    </div>
  );
}
