import { cn } from '@gruenerator/ui';
import { Link } from 'react-router-dom';

import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

import { MONITOR_EYEBROW, MONITOR_HEADING, MONITOR_PILL_TRACK } from './theme';

import type { MonitorLocale } from '../hooks/useMonitor';
import type { ReactNode } from 'react';

type MonitorPage = 'themen' | 'umfragen';

const SIBLINGS: { key: MonitorPage; label: string; path: string }[] = [
  { key: 'themen', label: 'Themen', path: '/experiments/monitor/themen' },
  { key: 'umfragen', label: 'Umfragen', path: '/experiments/monitor/umfragen' },
];

interface MonitorPageHeaderProps {
  /** The current page — its own entry is dropped from the sibling cross-nav. */
  current: MonitorPage;
  title: string;
  /** Right-aligned content: a subtitle line, a locale toggle, or both. */
  right?: ReactNode;
}

/**
 * In-page header for the standalone monitor pages (replaces the old MonitorShell
 * chrome): a "Monitor · <siblings>" eyebrow cross-nav, the page title, and a
 * right-aligned slot. Sibling links carry the locale param via `withLocale`.
 */
export function MonitorPageHeader({ current, title, right }: MonitorPageHeaderProps) {
  const { withLocale } = useMonitorLocaleParam();
  const siblings = SIBLINGS.filter((s) => s.key !== current);

  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
      <div>
        <p className={cn('mb-1.5', MONITOR_EYEBROW)}>
          Monitor
          {siblings.map((s) => (
            <span key={s.key}>
              {' · '}
              <Link
                to={withLocale(s.path)}
                className="border-b border-[#b9d0c5] text-[#52907a] no-underline hover:text-[#316049] dark:border-grey-600 dark:text-[#7fae9c]"
              >
                {s.label}
              </Link>
            </span>
          ))}
        </p>
        <h1
          className={cn(
            'm-0 text-[2.4rem] font-semibold leading-[1.1] tracking-[-0.02em]',
            MONITOR_HEADING
          )}
        >
          {title}
        </h1>
      </div>
      {right}
    </div>
  );
}

interface MonitorLocaleToggleProps {
  locale: MonitorLocale;
  onChange: (locale: MonitorLocale) => void;
}

/** DE/AT pill toggle used in the header right slot. */
export function MonitorLocaleToggle({ locale, onChange }: MonitorLocaleToggleProps) {
  return (
    <div className={MONITOR_PILL_TRACK}>
      <PillButton active={locale === 'de'} onClick={() => onChange('de')}>
        Deutschland
      </PillButton>
      <PillButton active={locale === 'at'} onClick={() => onChange('at')}>
        Österreich
      </PillButton>
    </div>
  );
}

interface PillButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Smaller padding for secondary toggles (e.g. map view). */
  size?: 'md' | 'sm';
}

/** A single segmented-control pill. Active = forest-green fill. */
export function PillButton({ active, onClick, children, size = 'md' }: PillButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border-none font-bold transition-colors',
        size === 'md' ? 'px-[18px] py-2 text-[0.9rem]' : 'px-3.5 py-1.5 text-[0.8rem]',
        active
          ? 'bg-[#316049] text-white shadow-[0_2px_8px_rgba(49,96,73,0.3)]'
          : 'bg-transparent text-[#3a4a42] hover:text-[#316049] dark:text-grey-300 dark:hover:text-white'
      )}
    >
      {children}
    </button>
  );
}
