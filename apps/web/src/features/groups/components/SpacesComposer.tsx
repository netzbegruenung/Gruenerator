import { buildGroupPath } from '@gruenerator/shared/groups';
import { TypingAnimation, useIsMobile } from '@gruenerator/ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FiCornerDownLeft, FiSearch } from 'react-icons/fi';
import { HiUser, HiUserGroup } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { type GroupSummary } from '../hooks/useGroups';

type SpaceType = 'personal' | 'standard';

interface SpacesComposerProps {
  /** The user's own spaces — the corpus the composer searches across. */
  spaces: GroupSummary[];
  isCreating: boolean;
  onCreate: (name: string, type: SpaceType) => void;
}

interface Option {
  key: string;
  render: () => React.ReactNode;
  onSelect: () => void;
}

const MAX_MATCHES = 6;

const PLACEHOLDERS = ['Neuen Space erstellen …', 'Space suchen …', 'Team-Space anlegen …'];
const PLACEHOLDERS_SHORT = ['Space erstellen …', 'Space suchen …', 'Team-Space …'];

function TypeIcon({ type }: { type: SpaceType }) {
  const Icon = type === 'standard' ? HiUserGroup : HiUser;
  return (
    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-[#DCE6F2] text-[#2E4E7A] dark:bg-[#14202E] dark:text-[#7CA2CB]">
      <Icon className="h-[15px] w-[15px]" />
    </span>
  );
}

/**
 * Create-or-search pill for the Spaces landing — same visual shell as the office
 * `DocsComposer`, pared down to two jobs: filter the user's own spaces (jump to
 * one) and create a new one, either as a "Single Space" (personal) or a
 * "Gruppenspace" (standard/team). No doc kinds, templates, backend search or
 * imports.
 */
export function SpacesComposer({ spaces, isCreating, onCreate }: SpacesComposerProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    []
  );

  const query = q.trim();
  const lcQuery = query.toLowerCase();
  const matches = lcQuery
    ? spaces.filter((s) => s.name.toLowerCase().includes(lcQuery)).slice(0, MAX_MATCHES)
    : [];
  // No name match → the user is naming a new space, so the create actions lead.
  const promptMode = query.length > 0 && matches.length === 0;

  const runCreate = (type: SpaceType) => {
    if (!query || isCreating) return;
    onCreate(query, type);
  };

  const searchOptions: Option[] = matches.map((s) => ({
    key: `space-${s.id}`,
    onSelect: () => navigate(buildGroupPath(s)),
    render: () => (
      <div className="flex w-full min-w-0 items-center gap-3">
        <TypeIcon type="standard" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[#22382E] dark:text-foreground">
            {s.name}
          </div>
          <div className="text-xs text-[#9AA8A1]">Space öffnen</div>
        </div>
      </div>
    ),
  }));

  const createOptions: Option[] = query
    ? [
        { type: 'personal' as const, label: 'als Single Space erstellen' },
        { type: 'standard' as const, label: 'als Gruppenspace erstellen' },
      ].map(({ type, label }) => ({
        key: `create-${type}`,
        onSelect: () => runCreate(type),
        render: () => (
          <div className="flex w-full min-w-0 items-center gap-3">
            <TypeIcon type={type} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[#22382E] dark:text-foreground">
                {`„${query}" ${label}`}
              </div>
              <div className="text-xs text-[#9AA8A1]">
                {type === 'standard' ? 'Mit Team — Mitglieder & geteilte Inhalte' : 'Nur für dich'}
              </div>
            </div>
            <FiCornerDownLeft size={14} className="flex-none text-[#9AA8A1]" />
          </div>
        ),
      }))
    : [];

  const options: Option[] = promptMode
    ? [...createOptions, ...searchOptions]
    : [...searchOptions, ...createOptions];

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
              words={isMobile ? PLACEHOLDERS_SHORT : PLACEHOLDERS}
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
            aria-label="Space erstellen oder suchen"
            className="w-full min-w-0 border-0 bg-transparent py-[9px] text-base text-[#22382E] outline-none placeholder:text-[#9AA8A1] dark:text-foreground"
          />
        </div>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCreate('personal')}
          disabled={query.length === 0 || isCreating}
          aria-label="Single Space erstellen"
          className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-[#4C8A6E] text-white transition-[background,transform] hover:bg-[#3E7A5F] active:scale-95 disabled:opacity-50"
        >
          {isCreating ? (
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
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {!promptMode && (
            <div className="flex items-center gap-2 px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9AA8A1]">
              <FiSearch size={11} /> Deine Spaces
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
