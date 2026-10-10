// The store subpath, not the package root: the composer sits on landing pages
// that must not pull the chat UI into their chunk.
import { useAgentStore } from '@gruenerator/chat/stores';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuItem,
  ResponsiveMenuSection,
  TypingAnimation,
  useIsMobile,
} from '@gruenerator/ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  FiCloud,
  FiCornerDownLeft,
  FiGrid,
  FiImage,
  FiMessageCircle,
  FiPlus,
  FiSearch,
  FiUpload,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { type FeatureHit, matchFeatures } from '../global-search/featureIndex';

import {
  DOC_TYPE_META,
  PROMPT_EXAMPLES,
  PROMPT_EXAMPLES_SHORT,
  detectChatIntent,
  detectDocType,
  detectPromptIntent,
  type DocKind,
} from './docTypeMeta';
import { useComposerOfficeSearch } from './useComposerOfficeSearch';

export type ImportKind = 'file' | 'sheet' | 'wolke' | 'photo';

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
  /** Which import options the "+" menu offers. Defaults to doc/sheet/wolke. */
  importKinds?: ImportKind[];
  /** Replaces the detected-type chip right of the input (e.g. a mode picker). */
  toolbarSlot?: React.ReactNode | ((query: string) => React.ReactNode);
  /** Let the create button fire without text (modes whose prompt is optional). */
  allowEmptySubmit?: boolean;
  /** Placeholder rotation. Defaults to the office examples; override per surface. */
  promptExamples?: string[];
  promptExamplesShort?: string[];
  /** Static placeholder instead of the rotating examples. The rotation reads as a
   * list of create commands, which hides that the field searches too. */
  placeholder?: string;
  /** Puts text into the field (and focuses it) whenever `id` changes, e.g. an example prompt. */
  draft?: { id: number; text: string };
  /** Show the live search results under the field. Off: the field only creates. */
  search?: boolean;
  /** Colours of the submit button (background + hover). Defaults to the Grünerator green. */
  submitClassName?: string;
  /** Glyph on the submit button. `search` on surfaces that lead with finding
   * things; the action stays "create" either way. */
  submitIcon?: 'arrow' | 'search';
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
const MAX_FIELD_HEIGHT = 168;
const SINGLE_LINE_HEIGHT = 44;

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
  allowImports = true,
  importKinds = ['file', 'sheet', 'wolke'],
  toolbarSlot,
  allowEmptySubmit = false,
  promptExamples = PROMPT_EXAMPLES,
  promptExamplesShort = PROMPT_EXAMPLES_SHORT,
  placeholder,
  search = true,
  draft,
  submitIcon = 'arrow',
  submitClassName = 'bg-[#4C8A6E] hover:bg-[#3E7A5F]',
  onGenerate,
  onSelectTemplate,
  onImport,
}: DocsComposerProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Set when a create was attempted on text that reads like a chat message —
  // holds the prompt the dialog then either hands to the chat or creates anyway.
  const [chatAsk, setChatAsk] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The blur→close timer outlives the input when a route change unmounts the
  // composer mid-blur; clear it so it can't fire on an unmounted tree.
  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    []
  );

  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The field grows with its text (up to MAX_FIELD_HEIGHT, then it scrolls); the pill's
  // buttons sit at the bottom edge once it is more than one line.
  const [multiline, setMultiline] = useState(false);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_FIELD_HEIGHT)}px`;
    setMultiline(el.scrollHeight > SINGLE_LINE_HEIGHT);
  }, [q]);
  useEffect(() => {
    if (!draft) return;
    setQ(draft.text);
    inputRef.current?.focus();
  }, [draft]);

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
  const contentHits = useComposerOfficeSearch(query, open && search);
  const localItemIds = new Set(matchedItems.map((it) => it.id));
  const contentMatches = contentHits.filter((h) => !localItemIds.has(h.id)).slice(0, MAX_ITEMS);

  // Tools/features/agents — "reel" surfaces the Reel tool, mirroring the
  // sidebar's global search.
  const toolHits = query && search ? matchFeatures(featureIndex, query, MAX_TOOLS) : [];

  // Tool hits stay out of `hasResults`: matchFeatures matches liberally (a
  // create term like "plan" can graze a tool's keywords), and they shouldn't
  // demote the create action — they render as an extra section regardless.
  const hasResults = matchedItems.length + contentMatches.length + matchedTemplates.length > 0;
  const promptMode = query.length > 0 && (detectPromptIntent(query) || !hasResults);

  // A question belongs in the chat, which this field cannot answer. Explain it
  // instead of silently generating a document out of it — but as an offer, not
  // a block: the create action stays available right below.
  const chatIntent = detectChatIntent(query);

  const create = (prompt: string) => {
    onGenerate(detectedKind, prompt);
  };

  // Asking a question here used to silently produce a document out of it. The
  // dropdown notice was easy to miss (mouse users go straight for the arrow
  // button), so the create is confirmed instead — the chat is one click away.
  const runCreate = () => {
    if ((!query && !allowEmptySubmit) || isGenerating) return;
    if (chatIntent && query) {
      setOpen(false);
      setChatAsk(query);
      return;
    }
    create(query);
  };

  // Hand the text over as a *draft*, not a sent message: the detection is a
  // heuristic, so the user gets to read it in the chat composer and press send.
  const runChatHandoff = (prompt = query) => {
    if (!prompt) return;
    setOpen(false);
    setChatAsk(null);
    useAgentStore.getState().setPendingDraft(prompt);
    void navigate('/chat');
  };

  const chatOption: Option = {
    key: 'chat',
    onSelect: () => runChatHandoff(),
    render: () => (
      <div className="flex w-full min-w-0 items-center gap-3">
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-[#E6F0EA] text-[#3E7A5F] dark:bg-grey-700 dark:text-grey-200">
          <FiMessageCircle size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[#22382E] dark:text-foreground">
            Im Chat fragen
          </div>
          <div className="text-xs text-muted-brand">Text wird in den Chat übernommen</div>
        </div>
        <FiCornerDownLeft size={14} className="flex-none text-muted-brand" />
      </div>
    ),
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
          <div className="text-xs text-muted-brand">
            Als {DOC_TYPE_META[detectedKind].label} generieren
          </div>
        </div>
        <FiCornerDownLeft size={14} className="flex-none text-muted-brand" />
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
          <div className="text-xs text-muted-brand">{DOC_TYPE_META[it.kind].label}</div>
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
          <div className="truncate text-xs text-muted-brand">
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
          {hit.subtitle && <div className="truncate text-xs text-muted-brand">{hit.subtitle}</div>}
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
          <div className="truncate text-xs text-muted-brand">Vorlage · {t.description}</div>
        </div>
      </div>
    ),
  }));

  const allImportDefs: Array<{ kind: ImportKind; label: string; icon: React.ReactNode }> = [
    { kind: 'file', label: 'Datei importieren …', icon: <FiUpload size={16} /> },
    { kind: 'sheet', label: 'Tabelle importieren …', icon: <FiGrid size={16} /> },
    { kind: 'wolke', label: 'Aus Wolke importieren …', icon: <FiCloud size={16} /> },
    { kind: 'photo', label: 'Foto hochladen …', icon: <FiImage size={16} /> },
  ];
  const importDefs = allImportDefs.filter((d) => importKinds.includes(d.kind));
  const runImport = (kind: ImportKind) => {
    setPlusOpen(false);
    onImport(kind);
  };

  const resultOptions: Option[] = [
    ...itemOptions,
    ...contentOptions,
    ...templateOptions,
    ...toolOptions,
  ];
  const baseOptions: Option[] = promptMode
    ? [createOption, ...resultOptions]
    : [...resultOptions, createOption];
  // First, so Enter takes the offer the notice above just made.
  const options: Option[] = chatIntent ? [chatOption, ...baseOptions] : baseOptions;

  const clampedActive = Math.min(active, Math.max(0, options.length - 1));
  const showDropdown = search && open && query.length > 0 && options.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'ArrowDown' && showDropdown) {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp' && showDropdown) {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!search) runCreate();
      else options[clampedActive]?.onSelect();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative mx-auto mt-10 w-full max-w-[760px]">
      <div
        className={`flex gap-3 border border-[#DFE8E2] bg-white py-[9px] pr-[9px] shadow-[0_4px_22px_rgba(31,63,51,.07)] transition-colors focus-within:border-grey-400 max-sm:gap-2 dark:border-grey-700 dark:bg-grey-800 dark:focus-within:border-grey-500 ${multiline ? 'items-end rounded-[28px]' : 'items-center rounded-full'} ${allowImports ? 'pl-[9px]' : 'pl-[22px] max-sm:pl-4'}`}
      >
        {allowImports && (
          <ResponsiveMenu
            open={plusOpen}
            onOpenChange={setPlusOpen}
            sheetTitle="Importieren"
            dropdownSide="bottom"
            dropdownClassName="w-60"
            trigger={
              <button
                type="button"
                aria-label="Importieren"
                className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full text-[#5C6B63] transition-colors hover:bg-[#F1F4F1] dark:text-grey-300 dark:hover:bg-grey-700"
              >
                <FiPlus className="h-5 w-5" />
              </button>
            }
            desktopContent={importDefs.map((d) => (
              <DropdownMenuItem key={d.kind} onClick={() => runImport(d.kind)}>
                {d.icon}
                <span>{d.label}</span>
              </DropdownMenuItem>
            ))}
            mobileContent={
              <ResponsiveMenuSection title="Importieren">
                {importDefs.map((d) => (
                  <ResponsiveMenuItem key={d.kind} icon={d.icon} onClick={() => runImport(d.kind)}>
                    {d.label}
                  </ResponsiveMenuItem>
                ))}
              </ResponsiveMenuSection>
            }
          />
        )}
        <div className="relative min-w-0 flex-1">
          {query.length === 0 && !placeholder && (
            <TypingAnimation
              words={isMobile ? promptExamplesShort : promptExamples}
              loop
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 truncate text-base text-muted-brand"
              typeSpeed={45}
              deleteSpeed={20}
              pauseDelay={1400}
            />
          )}
          <textarea
            ref={inputRef}
            rows={1}
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
            placeholder={placeholder}
            aria-label="Erstellen oder suchen"
            className="block w-full min-w-0 resize-none border-0 bg-transparent py-[9px] text-base leading-6 text-[#22382E] outline-none placeholder:text-muted-brand dark:text-foreground"
          />
        </div>

        {typeof toolbarSlot === 'function' ? toolbarSlot(query) : toolbarSlot}

        {query.length > 0 && !toolbarSlot && (
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
          disabled={(query.length === 0 && !allowEmptySubmit) || isGenerating}
          aria-label="Erstellen"
          className={`flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full text-white transition-[background,transform] active:scale-95 disabled:opacity-50 ${submitClassName}`}
        >
          {isGenerating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : submitIcon === 'search' ? (
            <FiSearch className="h-[17px] w-[17px]" strokeWidth={2.1} />
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
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- onMouseDown only preserves focus for the click below; the options themselves are real buttons
        <div
          className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[360px] overflow-y-auto overflow-x-hidden rounded-2xl border border-[#E1E9E4] bg-white p-1.5 shadow-[0_20px_50px_rgba(31,63,51,.18)] dark:border-grey-700 dark:bg-grey-800"
          onMouseDown={(e) => {
            // keep focus so the input's blur→close doesn't fire before the click
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {chatIntent && (
            <div
              role="status"
              className="mb-1 flex items-start gap-2.5 rounded-xl bg-[#F2F6F3] px-3 py-2.5 dark:bg-grey-700/60"
            >
              <FiMessageCircle
                size={15}
                aria-hidden="true"
                className="mt-px flex-none text-[#3E7A5F] dark:text-grey-200"
              />
              <p className="text-xs leading-relaxed text-[#4A5B52] dark:text-grey-300">
                Das klingt nach einer Frage. Hier entstehen Dokumente, Boards, Tabellen und
                Präsentationen — antworten kann der Chat.
              </p>
            </div>
          )}
          {!promptMode && !chatIntent && (
            <div className="flex items-center gap-2 px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-brand">
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

      <AlertDialog open={chatAsk !== null} onOpenChange={(o) => !o && setChatAsk(null)}>
        {/* Default size, not `sm`: that one is 320px wide and its footer is a
            hard `grid-cols-2`, built for two short buttons. The third would
            wrap into a row of its own, left-aligned beside empty space. */}
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Das klingt nach einer Frage</AlertDialogTitle>
            <AlertDialogDescription>
              Hier entstehen Dokumente, Boards, Tabellen und Präsentationen — beantworten kann deine
              Frage der Chat. Dein Text wird dorthin übernommen, abgeschickt wird er erst von dir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Radix focuses the Cancel button when the dialog opens, so the
              non-committal option has to sit there: the dialog is reached by
              pressing Enter in the composer, and a second Enter must not be
              able to do the thing the dialog is asking about. Both real
              choices are Actions — they close the dialog either way. */}
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={() => chatAsk && create(chatAsk)}>
              Trotzdem erstellen
            </AlertDialogAction>
            <AlertDialogAction onClick={() => chatAsk && runChatHandoff(chatAsk)}>
              Im Chat fragen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
