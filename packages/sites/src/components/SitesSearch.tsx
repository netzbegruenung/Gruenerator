import { type SiteSummary } from '@gruenerator/contracts';
import { TypingAnimation, useIsMobile } from '@gruenerator/ui';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { FiGlobe, FiPlus, FiSearch } from 'react-icons/fi';

import { formatAddress } from '../utils/siteAddress';

interface SitesSearchProps {
  sites: SiteSummary[];
  publicOrigin: string | null;
  onOpen: (site: SiteSummary) => void;
  /** Null at the limit: then no create option is offered. */
  onCreate: (() => void) | null;
}

interface Option {
  key: string;
  render: () => ReactNode;
  onSelect: () => void;
}

const MAX_MATCHES = 6;
const PLACEHOLDERS = ['Website suchen …', 'Nach Name oder Adresse suchen …'];
const PLACEHOLDERS_SHORT = ['Website suchen …'];

function OptionIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-[#DCEAF2] text-[#1A5576] dark:bg-[#142430] dark:text-[#9ACBE4]">
      {children}
    </span>
  );
}

/**
 * Search pill for `/sites`, the same shell as the Projekte composer: filters the own sites by
 * title or address (jump to one), and offers creating a new site. Creating happens on its own
 * page (`/sites/neu`), so nothing typed here becomes a site.
 */
export function SitesSearch({ sites, publicOrigin, onOpen, onCreate }: SitesSearchProps) {
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

  const query = q.trim().toLowerCase();
  const matches = query
    ? sites
        .filter((s) => s.site_title.toLowerCase().includes(query) || s.subdomain.includes(query))
        .slice(0, MAX_MATCHES)
    : [];

  const options: Option[] = [
    ...matches.map((s) => ({
      key: `site-${s.id}`,
      onSelect: () => onOpen(s),
      render: () => (
        <div className="flex w-full min-w-0 items-center gap-3">
          <OptionIcon>
            <FiGlobe className="h-[14px] w-[14px]" />
          </OptionIcon>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[#22382E] dark:text-foreground">
              {s.site_title}
            </div>
            <div className="truncate text-xs text-muted-brand">
              {formatAddress(publicOrigin, s.subdomain)}
            </div>
          </div>
        </div>
      ),
    })),
    ...(onCreate
      ? [
          {
            key: 'create',
            onSelect: onCreate,
            render: () => (
              <div className="flex w-full min-w-0 items-center gap-3">
                <OptionIcon>
                  <FiPlus className="h-[15px] w-[15px]" />
                </OptionIcon>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[#22382E] dark:text-foreground">
                    Neue Website erstellen
                  </div>
                  <div className="text-xs text-muted-brand">
                    Aus einer Beschreibung oder einem Flyer
                  </div>
                </div>
              </div>
            ),
          },
        ]
      : []),
  ];

  const selected = Math.min(active, options.length - 1);
  const selectedOption = options[selected];
  const showDropdown = open && query.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(selected + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(selected - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectedOption?.onSelect();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative mx-auto mt-10 w-full max-w-[760px] max-md:mt-6">
      <div className="flex items-center gap-3 rounded-full border border-[#DFE8E2] bg-white py-[9px] pl-[22px] pr-[9px] shadow-[0_4px_22px_rgba(31,63,51,.07)] transition-colors focus-within:border-grey-400 max-sm:gap-2 max-sm:pl-4 dark:border-grey-700 dark:bg-grey-800 dark:focus-within:border-grey-500">
        <FiSearch aria-hidden className="size-[18px] flex-none text-muted-brand" />
        <div className="relative min-w-0 flex-1">
          {q.length === 0 && (
            <TypingAnimation
              words={isMobile ? PLACEHOLDERS_SHORT : PLACEHOLDERS}
              loop
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 truncate text-base text-muted-brand"
              typeSpeed={45}
              deleteSpeed={20}
              pauseDelay={1400}
            />
          )}
          <input
            type="search"
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
            aria-label="Websites durchsuchen"
            className="w-full min-w-0 border-0 bg-transparent py-[9px] text-base text-[#22382E] outline-none placeholder:text-muted-brand dark:text-foreground [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            aria-label="Neue Website erstellen"
            title="Neue Website erstellen"
            className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-[#4C8A6E] text-white transition-[background,transform] hover:bg-[#3E7A5F] active:scale-95"
          >
            <FiPlus aria-hidden className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      {showDropdown && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- onMouseDown only preserves focus for the click below; the options themselves are real buttons
        <div
          className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[360px] overflow-y-auto overflow-x-hidden rounded-2xl border border-[#E1E9E4] bg-white p-1.5 shadow-[0_20px_50px_rgba(31,63,51,.18)] dark:border-grey-700 dark:bg-grey-800"
          onMouseDown={(e) => {
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {matches.length > 0 ? (
            <div className="flex items-center gap-2 px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-brand">
              <FiSearch size={11} /> Deine Websites
            </div>
          ) : (
            <p className="m-0 px-3 py-2 text-sm text-grey-600 dark:text-grey-400">
              Keine Website gefunden.
            </p>
          )}
          {options.map((opt, i) => (
            <button
              key={opt.key}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={opt.onSelect}
              className={`flex w-full min-w-0 items-center rounded-xl px-3 py-2.5 text-left transition-colors ${
                i === selected
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
