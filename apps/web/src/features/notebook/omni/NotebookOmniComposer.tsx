import { useComposerRuntime } from '@assistant-ui/react';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import { TypingAnimation, useIsMobile } from '@gruenerator/ui';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FiBook, FiCornerDownLeft, FiFilter, FiLayers, FiSearch } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { useResearchFilters } from '../manual-search/useResearchFilters';

import {
  buildSystemTargets,
  detectNotebookEntities,
  detectQuestionIntent,
  matchTargetsByName,
  type OmniTarget,
} from './omniIntent';
import { OmniResultsPanel } from './OmniResultsPanel';
import {
  describeParsedFilters,
  parseResearchIntent,
  type ParsedResearchIntent,
} from './parseResearchIntent';

import type { IconType } from 'react-icons';

interface NotebookOmniComposerProps {
  /** Offer the "Manuell recherchieren" option (hidden when the surface has no research tab). */
  onManualSearch?: (query: string) => void;
}

interface Option {
  key: string;
  render: () => React.ReactNode;
  onSelect: () => void;
}

const MAX_ENTITY_ASKS = 2;
const MAX_OPEN_MATCHES = 4;

const OMNI_EXAMPLES_DE = [
  'Was tun die Grünen Berlin für Hitzeschutz?',
  'Was fordert Bayern zur Windkraft?',
  'Wofür steht das Grundsatzprogramm?',
  '… oder tippe, um ein Notebook zu suchen',
];

const OMNI_EXAMPLES_AT = [
  'Was tun die Grünen in Wien für Hitzeschutz?',
  'Was fordert Österreich zur Windkraft?',
  'Wofür steht das Grundsatzprogramm?',
  '… oder tippe, um ein Notebook zu suchen',
];

const OMNI_EXAMPLES_SHORT = ['Frag die Notebooks …', '… oder tippe zum Suchen'];

function TargetChip({ target, size = 26 }: { target: OmniTarget; size?: number }) {
  const Icon = target.icon ?? FiBook;
  const icon = Math.round(size * 0.55);
  return (
    <span
      className="flex flex-none items-center justify-center rounded-lg bg-[#FBE4F0] text-[#B4005C] dark:bg-[#3A1E2C] dark:text-[#F2A9CE]"
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: icon, height: icon }} />
    </span>
  );
}

/** Neutral grey chip for non-notebook actions (aggregate ask, manual search). */
function NeutralChip({ icon: Icon }: { icon: IconType }) {
  return (
    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-[#F1F4F1] text-[#5C6B63] dark:bg-grey-700 dark:text-grey-300">
      <Icon size={14} />
    </span>
  );
}

function OptionRow({
  chip,
  title,
  subtitle,
  showEnterHint = false,
}: {
  chip: React.ReactNode;
  title: string;
  subtitle: string;
  showEnterHint?: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-3">
      {chip}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[#22382E] dark:text-foreground">
          {title}
        </div>
        <div className="truncate text-xs text-[#9AA8A1]">{subtitle}</div>
      </div>
      {showEnterHint && <FiCornerDownLeft size={14} className="flex-none text-[#9AA8A1]" />}
    </div>
  );
}

/**
 * One input for the notebooks surface: ask the aggregate, route a question to
 * the notebook it names ("… die Grünen Berlin …" → Berlin notebook chat), open
 * a notebook by name, or jump into manual research. Modeled on the docs
 * composer (`DocsComposer`): local heuristics, ranked options, no hard redirect.
 */
export function NotebookOmniComposer({ onManualSearch }: NotebookOmniComposerProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const composerRuntime = useComposerRuntime();
  const isAustrian = useAuthStore((s) => s.locale === 'de-AT');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [resultsFor, setResultsFor] = useState<ParsedResearchIntent | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Topic/type facet vocabulary for the NL parser (all searchable collections,
  // cached by React Query — the gallery below warms the same data).
  const { filterFields, setFiltersEnabled } = useResearchFilters();
  useEffect(() => {
    setFiltersEnabled(true);
  }, [setFiltersEnabled]);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    []
  );

  const systemTargets = useMemo(() => buildSystemTargets(), []);

  // Own notebooks join the lexicon by name. The gallery below fetches the same
  // query, so this is served from the React Query cache.
  const { query: collectionsQuery } = useNotebookCollections({ isActive: true });
  const targets = useMemo(() => {
    const owned = (collectionsQuery.data ?? []).filter(
      (c) => c.access_source == null || c.access_source === 'owned'
    );
    const userTargets: OmniTarget[] = owned.map((c) => ({
      key: `user-${c.id}`,
      title: c.name,
      path: `/notebooks/${c.slug_suffix ? buildNotebookSlug(c.name, c.slug_suffix) : c.id}`,
      aliases: [c.name.toLowerCase()],
    }));
    return [...systemTargets, ...userTargets];
  }, [systemTargets, collectionsQuery.data]);

  const question = q.trim();
  const questionIntent = detectQuestionIntent(question);
  const entityMatches = useMemo(
    () => detectNotebookEntities(question, targets).slice(0, MAX_ENTITY_ASKS),
    [question, targets]
  );
  const openMatches = useMemo(() => {
    const entityKeys = new Set(entityMatches.map((m) => m.target.key));
    return matchTargetsByName(question, targets)
      .filter((t) => !entityKeys.has(t.key))
      .slice(0, MAX_OPEN_MATCHES);
  }, [question, targets, entityMatches]);

  const parsedIntent = useMemo(
    () => parseResearchIntent(question, { targets, filterFields }),
    [question, targets, filterFields]
  );
  // Offer the filtered search only when a concrete filter (date/topic/type/recency)
  // was recognised — a bare region name still routes to that notebook's chat.
  const hasResearchFilters =
    Object.keys(parsedIntent.filters).length > 0 || parsedIntent.sortBy != null;

  const askInNotebook = (target: OmniTarget) => {
    if (!question) return;
    // freshConversation so the routed question opens a clean thread rather than
    // appending to whatever cached conversation the notebook last had.
    void navigate(target.path, { state: { question, freshConversation: true } });
  };

  const askAggregate = () => {
    if (!question) return;
    composerRuntime.setText(question);
    composerRuntime.send();
    setQ('');
    setOpen(false);
  };

  const runFilteredSearch = () => {
    if (!question) return;
    setResultsFor(parsedIntent);
    setActive(0);
    setOpen(false);
  };

  const filteredSummary = [
    ...describeParsedFilters(parsedIntent).map((c) => c.label),
    ...(parsedIntent.sortBy === 'date_desc' ? ['neueste zuerst'] : []),
  ].join(' · ');

  const filteredOption: Option[] = hasResearchFilters
    ? [
        {
          key: 'filtered-search',
          onSelect: runFilteredSearch,
          render: () => (
            <OptionRow
              chip={<NeutralChip icon={FiFilter} />}
              title="Gefiltert durchsuchen"
              subtitle={filteredSummary || `Trefferliste für „${question}"`}
              showEnterHint
            />
          ),
        },
      ]
    : [];

  const entityAskOptions: Option[] = entityMatches.map(({ target }, i) => ({
    key: `ask-${target.key}`,
    onSelect: () => askInNotebook(target),
    render: () => (
      <OptionRow
        chip={<TargetChip target={target} />}
        title={`Im Notebook „${target.title}" fragen`}
        subtitle={`„${question}"`}
        showEnterHint={i === 0 && questionIntent && !hasResearchFilters}
      />
    ),
  }));

  const aggregateOption: Option = {
    key: 'ask-aggregate',
    onSelect: askAggregate,
    render: () => (
      <OptionRow
        chip={<NeutralChip icon={FiLayers} />}
        title="Alle Notebooks fragen"
        subtitle={`„${question}"`}
        showEnterHint={questionIntent && entityMatches.length === 0 && !hasResearchFilters}
      />
    ),
  };

  const openOptions: Option[] = openMatches.map((target) => ({
    key: `open-${target.key}`,
    onSelect: () => void navigate(target.path, { state: { freshConversation: true } }),
    render: () => (
      <OptionRow
        chip={<TargetChip target={target} />}
        title={target.title}
        subtitle="Notebook öffnen"
      />
    ),
  }));

  const manualOption: Option[] = onManualSearch
    ? [
        {
          key: 'manual-search',
          onSelect: () => {
            setOpen(false);
            onManualSearch(question);
          },
          render: () => (
            <OptionRow
              chip={<NeutralChip icon={FiSearch} />}
              title="Manuell recherchieren"
              subtitle={`Trefferliste mit Filtern für „${question}"`}
            />
          ),
        },
      ]
    : [];

  // Concrete NL filters → filtered search leads; question → ask options lead;
  // keyword lookup → open/research options lead.
  const options: Option[] = hasResearchFilters
    ? [...filteredOption, ...entityAskOptions, aggregateOption, ...openOptions, ...manualOption]
    : questionIntent
      ? [...entityAskOptions, aggregateOption, ...openOptions, ...manualOption]
      : [...openOptions, ...manualOption, ...entityAskOptions, aggregateOption];

  const clampedActive = Math.min(active, Math.max(0, options.length - 1));
  const showDropdown = open && question.length > 0 && options.length > 0 && !resultsFor;
  const detectedTarget = questionIntent ? (entityMatches[0]?.target ?? null) : null;
  const DetectedIcon = detectedTarget?.icon ?? FiBook;

  // Honor the keyboard-highlighted option so clicking the submit button matches
  // what Enter would do after the user arrowed down; falls back to the top row.
  const runPrimary = () => {
    if (!question) return;
    (options[clampedActive] ?? options[0])?.onSelect();
  };

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
    <div className="relative mx-auto w-full max-w-[760px]">
      <div className="flex items-center gap-3 rounded-full border border-[#DFE8E2] bg-white py-[9px] pl-[22px] pr-[9px] shadow-[0_4px_22px_rgba(31,63,51,.07)] transition-colors focus-within:border-grey-400 max-sm:gap-2 max-sm:pl-4 dark:border-grey-700 dark:bg-grey-800 dark:focus-within:border-grey-500">
        <div className="relative min-w-0 flex-1">
          {question.length === 0 && (
            <TypingAnimation
              words={
                isMobile ? OMNI_EXAMPLES_SHORT : isAustrian ? OMNI_EXAMPLES_AT : OMNI_EXAMPLES_DE
              }
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
              setResultsFor(null);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={onKeyDown}
            aria-label="Notebooks fragen oder durchsuchen"
            className="w-full min-w-0 border-0 bg-transparent py-[9px] text-base text-[#22382E] outline-none placeholder:text-[#9AA8A1] dark:text-foreground"
          />
        </div>

        {detectedTarget && (
          <span
            className="flex flex-none items-center gap-1.5 rounded-full bg-[#FBE4F0] px-[11px] py-[5px] text-[12.5px] font-bold text-[#B4005C] max-[420px]:px-1.5 dark:bg-[#3A1E2C] dark:text-[#F2A9CE]"
            aria-label={`Erkanntes Notebook: ${detectedTarget.title}`}
          >
            <DetectedIcon className="h-[13px] w-[13px]" />
            <span className="max-[420px]:hidden">{detectedTarget.title}</span>
          </span>
        )}

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={runPrimary}
          disabled={question.length === 0}
          aria-label="Fragen oder suchen"
          className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-[#D6006E] text-white transition-[background,transform] hover:bg-[#B4005C] active:scale-95 disabled:opacity-50"
        >
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

      {resultsFor && <OmniResultsPanel parsed={resultsFor} />}
    </div>
  );
}
