import { TypingAnimation, useIsMobile } from '@gruenerator/ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FiCloud, FiCornerDownLeft, FiGrid, FiSearch, FiUpload } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { type FeatureHit, matchFeatures } from '../global-search/featureIndex';

import {
  DOC_TYPE_META,
  PROMPT_EXAMPLES,
  PROMPT_EXAMPLES_SHORT,
  detectDocType,
  detectPromptIntent,
  type DocKind,
} from './docTypeMeta';
import { useComposerOfficeSearch } from './useComposerOfficeSearch';

export type ImportKind = 'file' | 'sheet' | 'wolke';

/** An existing document/board the live search can jump to. */
export interface ComposerItem {
  id: string;
  title: string;
  kind: DocKind;
  openPath: string;
}

/** A starter template the live search can offer. */
export interface ComposerTemplate {
  key: string;
  kind: DocKind;
  id: string;
  title: string;
  description: string;
}

interface DocsComposerProps {
  items: ComposerItem[];
  templates: ComposerTemplate[];
  /** Client-side index of tools/features/agents — powers the "reel → Reel" tool hits. */
  featureIndex: FeatureHit[];
  isGenerating: boolean;
  /** Offer sharepic detection/creation (gated: SHOW_SHAREPIC_STUDIO, not de-AT). */
  sharepicEnabled?: boolean;
  /** Lock every create to one kind (type-scoped landing pages), bypassing keyword detection. */
  forcedKind?: DocKind;
  /** Offer the "… importieren" options (doc/sheet/wolke). Off for sharepic-only surfaces. */
  allowImports?: boolean;
  /** Placeholder rotation. Defaults to the office examples; override per surface. */
  promptExamples?: string[];
  promptExamplesShort?: string[];
  onGenerate: (kind: DocKind, prompt: string) => void;
  onSelectTemplate: (kind: DocKind, id: string) => void;
  onImport: (kind: ImportKind) => void;
}

interface Option {
  key: string;
  render: () => React.ReactNode;
  onSelect: () => void;
}

const MAX_ITEMS = 5;
const MAX_TEMPLATES = 4;
const MAX_TOOLS = 4;

function TypeChip({ kind, size = 26 }: { kind: DocKind; size?: number }) {
  const meta = DOC_TYPE_META[kind];
  const Icon = meta.Icon;
  const icon = Math.round(size * 0.55);
  return (
    <span
      className="flex flex-none items-center justify-center rounded-lg"
      style={{ width: size, height: size, background: meta.bg, color: meta.color }}
    >
      <Icon style={{ width: icon, height: icon }} />
    </span>
  );
}

export function DocsComposer({
  items,
  templates,
  featureIndex,
  isGenerating,
  sharepicEnabled = false,
  forcedKind,
  promptExamples = PROMPT_EXAMPLES,
  promptExamplesShort = PROMPT_EXAMPLES_SHORT,
  onGenerate,
  onSelectTemplate,
  onImport,
}: DocsComposerProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The blur→close timer outlives the input when a route change unmounts the
  // composer mid-blur; clear it so it can't fire on an unmounted tree.
  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    []
  );

  const query = q.trim();
  const detectedKind = forcedKind ?? detectDocType(query, sharepicEnabled);

  const lcQuery = query.toLowerCase();
  const matchedItems = lcQuery
    ? items.filter((it) => it.title.toLowerCase().includes(lcQuery)).slice(0, MAX_ITEMS)
    : [];
  const matchedTemplates = lcQuery
    ? templates
        .filter(
          (t) =>
            t.title.toLowerCase().includes(lcQuery) || t.description.toLowerCase().includes(lcQuery)
        )
        .slice(0, MAX_TEMPLATES)
    : [];

  // Content matches from the backend — documents/boards/sheets/presentations
  // whose query term lives in the body, not the title. Drop the ones already
  // shown as an instant title match so a hit doesn't appear twice.
  const contentHits = useComposerOfficeSearch(query, open);
  const localItemIds = new Set(matchedItems.map((it) => it.id));
  const contentMatches = contentHits.filter((h) => !localItemIds.has(h.id)).slice(0, MAX_ITEMS);

  // Tools/features/agents — "reel" surfaces the Reel tool, mirroring the
  // sidebar's global search.
  const toolHits = query ? matchFeatures(featureIndex, query, MAX_TOOLS) : [];

  // Tool hits stay out of `hasResults`: matchFeatures matches liberally (a
  // create term like "plan" can graze a tool's keywords), and they shouldn't
  // demote the create action or hide the import fallback — they render as an
  // extra section regardless.
  const hasResults = matchedItems.length + contentMatches.length + matchedTemplates.length > 0;
  const promptMode = query.length > 0 && (detectPromptIntent(query) || !hasResults);

  const runCreate = () => {
    if (!query || isGenerating) return;
    onGenerate(detectedKind, query);
  };

  const createOption: Option = {
    key: 'create',
    onSelect: runCreate,
    render: () => (
      <div className="flex w-full min-w-0 items-center gap-3">
        <TypeChip kind={detectedKind} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[#22382E] dark:text-foreground">
            {`„${query}" mit KI erstellen`}
          </div>
          <div className="text-xs text-[#9AA8A1]">
            Als {DOC_TYPE_META[detectedKind].label} generieren
          </div>
        </div>
        <FiCornerDownLeft size={14} className="flex-none text-[#9AA8A1]" />
      </div>
    ),
  };

  const itemOptions: Option[] = matchedItems.map((it) => ({
    key: `item-${it.kind}-${it.id}`,
    onSelect: () => navigate(it.openPath),
    render: () => (
      <div className="flex w-full min-w-0 items-center gap-3">
        <TypeChip kind={it.kind} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[#22382E] dark:text-foreground">
            {it.title}
          </div>
          <div className="text-xs text-[#9AA8A1]">{DOC_TYPE_META[it.kind].label}</div>
        </div>
      </div>
    ),
  }));

  const contentOptions: Option[] = contentMatches.map((h) => ({
    key: `content-${h.kind}-${h.id}`,
    onSelect: () => navigate(h.url),
    render: () => (
      <div className="flex w-full min-w-0 items-center gap-3">
        <TypeChip kind={h.kind} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[#22382E] dark:text-foreground">
            {h.title}
          </div>
          <div className="truncate text-xs text-[#9AA8A1]">
            {h.snippet || DOC_TYPE_META[h.kind].label}
          </div>
        </div>
      </div>
    ),
  }));

  const toolOptions: Option[] = toolHits.map((hit) => ({
    key: `tool-${hit.key}`,
    onSelect: () => navigate(hit.path),
    render: () => (
      <div className="flex w-full min-w-0 items-center gap-3">
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-[#F1F4F1] text-[#5C6B63] dark:bg-grey-700 dark:text-grey-300">
          {hit.icon ? (
            <hit.icon aria-hidden="true" className="size-[15px]" />
          ) : (
            <FiSearch size={15} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[#22382E] dark:text-foreground">
            {hit.title}
          </div>
          {hit.subtitle && <div className="truncate text-xs text-[#9AA8A1]">{hit.subtitle}</div>}
        </div>
      </div>
    ),
  }));

  const templateOptions: Option[] = matchedTemplates.map((t) => ({
    key: `tpl-${t.key}`,
    onSelect: () => onSelectTemplate(t.kind, t.id),
    render: () => (
      <div className="flex w-full min-w-0 items-center gap-3">
        <TypeChip kind={t.kind} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[#22382E] dark:text-foreground">
            {t.title}
          </div>
          <div className="truncate text-xs text-[#9AA8A1]">Vorlage · {t.description}</div>
        </div>
      </div>
    ),
  }));

  const importDefs: Array<{ kind: ImportKind; label: string; icon: React.ReactNode }> = [
    { kind: 'file', label: 'Datei importieren …', icon: <FiUpload size={16} /> },
    { kind: 'sheet', label: 'Tabelle importieren …', icon: <FiGrid size={16} /> },
    { kind: 'wolke', label: 'Aus Wolke importieren …', icon: <FiCloud size={16} /> },
  ];
  const showImports =
    query.length > 0 &&
    (!hasResults || /import|datei|wolke|hochlad|upload|\.(xlsx|csv|docx|pdf)/.test(lcQuery));
  const importOptions: Option[] = (showImports ? importDefs : []).map((d) => ({
    key: `import-${d.kind}`,
    // Close first — the import dialog is modal, and the dropdown would otherwise
    // stay mounted behind it (the row's onMouseDown keeps the input focused).
    onSelect: () => {
      setOpen(false);
      onImport(d.kind);
    },
    render: () => (
      <div className="flex w-full min-w-0 items-center gap-3 text-[#5C6B63] dark:text-grey-300">
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-[#F1F4F1] dark:bg-grey-700">
          {d.icon}
        </span>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{d.label}</div>
      </div>
    ),
  }));

  const resultOptions: Option[] = [
    ...itemOptions,
    ...contentOptions,
    ...templateOptions,
    ...toolOptions,
    ...importOptions,
  ];
  const options: Option[] = promptMode
    ? [createOption, ...resultOptions]
    : [...resultOptions, createOption];

  const clampedActive = Math.min(active, Math.max(0, options.length - 1));
  const showDropdown = open && query.length > 0 && options.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[clampedActive];
      if (opt) opt.onSelect();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative mx-auto mt-10 w-full max-w-[760px]">
      <div className="flex items-center gap-3 rounded-full border border-[#DFE8E2] bg-white py-[9px] pl-[22px] pr-[9px] shadow-[0_4px_22px_rgba(31,63,51,.07)] transition-colors focus-within:border-grey-400 max-sm:gap-2 max-sm:pl-4 dark:border-grey-700 dark:bg-grey-800 dark:focus-within:border-grey-500">
        <div className="relative min-w-0 flex-1">
          {query.length === 0 && (
            <TypingAnimation
              words={isMobile ? promptExamplesShort : promptExamples}
              loop
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 truncate text-base text-[#9AA8A1]"
              typeSpeed={45}
              deleteSpeed={20}
              pauseDelay={1400}
            />
          )}
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={onKeyDown}
            aria-label="Erstellen oder suchen"
            className="w-full min-w-0 border-0 bg-transparent py-[9px] text-base text-[#22382E] outline-none placeholder:text-[#9AA8A1] dark:text-foreground"
          />
        </div>

        {query.length > 0 && (
          <span
            // Narrow phones: drop the word, keep the coloured type icon — the
            // label ("Präsentation") otherwise squeezes the input to nothing.
            className="flex flex-none items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[12.5px] font-bold max-[420px]:px-1.5"
            style={{
              background: DOC_TYPE_META[detectedKind].bg,
              color: DOC_TYPE_META[detectedKind].color,
            }}
            aria-label={DOC_TYPE_META[detectedKind].label}
          >
            {(() => {
              const Icon = DOC_TYPE_META[detectedKind].Icon;
              return <Icon className="h-[13px] w-[13px]" />;
            })()}
            <span className="max-[420px]:hidden">{DOC_TYPE_META[detectedKind].label}</span>
          </span>
        )}

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={runCreate}
          disabled={query.length === 0 || isGenerating}
          aria-label="Erstellen"
          className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-[#4C8A6E] text-white transition-[background,transform] hover:bg-[#3E7A5F] active:scale-95 disabled:opacity-50"
        >
          {isGenerating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[17px] w-[17px]"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          )}
        </button>
      </div>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[360px] overflow-y-auto overflow-x-hidden rounded-2xl border border-[#E1E9E4] bg-white p-1.5 shadow-[0_20px_50px_rgba(31,63,51,.18)] dark:border-grey-700 dark:bg-grey-800"
          onMouseDown={(e) => {
            // keep focus so the input's blur→close doesn't fire before the click
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {!promptMode && (
            <div className="flex items-center gap-2 px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9AA8A1]">
              <FiSearch size={11} /> Ergebnisse
            </div>
          )}
          {options.map((opt, i) => (
            <button
              key={opt.key}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={opt.onSelect}
              className={`flex w-full min-w-0 items-center rounded-xl px-3 py-2.5 text-left transition-colors ${
                i === clampedActive
                  ? 'bg-[#F2F6F3] dark:bg-grey-700/60'
                  : 'hover:bg-[#F2F6F3] dark:hover:bg-grey-700/60'
              }`}
            >
              {opt.render()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
