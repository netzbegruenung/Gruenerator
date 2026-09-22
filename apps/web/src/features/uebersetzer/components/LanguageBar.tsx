import { type TranslationLanguage } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { PiArrowsLeftRight, PiCaretDown } from 'react-icons/pi';

import { AUTO, AUTO_LABEL, languageName } from './languageOptions';

import { cn } from '@/utils/cn';

interface LanguageBarProps {
  /** Screen-reader name of the picker — "Von" or "Nach". */
  label: string;
  /** Names the quick-pick group, e.g. "Ausgangssprache" → "Schnellwahl Ausgangssprache". */
  quickLabel: string;
  value: string;
  onChange: (code: string) => void;
  options: readonly TranslationLanguage[];
  /** The two to four codes shown as quick-pick tabs, most recent first. */
  recent: readonly string[];
  /** Offer "Automatisch erkennen" as the first entry (source side only). */
  withAuto?: boolean;
  /** A glossary translates into the chosen target — auto would silently drop it. */
  autoDisabled?: boolean;
  onSwap?: () => void;
  swapDisabled?: boolean;
  /** Sits at the right end of the bar, e.g. the formality menu. */
  children?: ReactNode;
}

/**
 * Language picker as a tab strip: the last few languages are one click away,
 * the full DeepL list stays reachable through a real `<select>` behind the
 * chevron. The select — not the tabs — carries the accessible name, so it
 * remains the one control that announces and holds the value.
 */
export function LanguageBar({
  label,
  quickLabel,
  value,
  onChange,
  options,
  recent,
  withAuto = false,
  autoDisabled = false,
  onSwap,
  swapDisabled,
  children,
}: LanguageBarProps) {
  const nameOf = (code: string) => (code === AUTO ? AUTO_LABEL : languageName(options, code));

  return (
    <div className="flex items-center gap-xxs border-b border-grey-200 px-xxs">
      <div
        role="group"
        aria-label={`Schnellwahl ${quickLabel}`}
        className="flex min-w-0 flex-1 items-center gap-xxs overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {recent.map((code) => {
          const active = code === value;
          return (
            <button
              key={code}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(code)}
              className={cn(
                'h-10 shrink-0 cursor-pointer whitespace-nowrap border-0 bg-transparent px-sm text-sm font-semibold',
                'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                active
                  ? 'text-primary-600 shadow-[inset_0_-3px_0_var(--primary-500)]'
                  : 'text-grey-700 hover:text-primary-600'
              )}
            >
              {nameOf(code)}
            </button>
          );
        })}
      </div>

      {/* The real control: invisible over the chevron, so every language stays
          reachable by keyboard and the picker keeps one accessible name. */}
      <div className="relative flex h-10 w-9 shrink-0 items-center justify-center rounded-sm text-grey-700 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50">
        <PiCaretDown aria-hidden="true" className="text-lg" />
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {withAuto ? (
            <option value={AUTO} disabled={autoDisabled}>
              {autoDisabled ? 'Bitte wählen' : AUTO_LABEL}
            </option>
          ) : null}
          {options.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {children}

      {onSwap ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 rounded-full"
          aria-label="Sprachen tauschen"
          title="Sprachen tauschen"
          disabled={swapDisabled}
          onClick={onSwap}
        >
          <PiArrowsLeftRight aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
