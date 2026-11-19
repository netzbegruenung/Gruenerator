import { cn } from '@gruenerator/shared/utils';
import { Label } from '@gruenerator/ui';
import { useEffect } from 'react';

import { useHandleCheck, type HandleCheck } from '../../../hooks/useHandleCheck';
import { addressHost } from '../../../utils/siteAddress';

// The two texts for invalid and reserved are the server's (HANDLE_MESSAGES in sitesContractRouter).
export const HANDLE_CHECK_MESSAGES: Record<HandleCheck, string | null> = {
  idle: null,
  checking: 'Adresse wird geprüft …',
  unchanged: null,
  available: 'Diese Adresse ist frei',
  taken: 'Diese Adresse ist bereits vergeben',
  invalid:
    'Die Adresse darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten und muss 3 bis 30 Zeichen lang sein',
  reserved: 'Diese Adresse ist reserviert',
};

export const ADDRESS_LOCKED_MESSAGE =
  'Die Adresse lässt sich nach dem ersten Veröffentlichen nicht mehr ändern.';

const MAX_LENGTH = 30;

export function normalizeHandleInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .slice(0, MAX_LENGTH);
}

interface AddressFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** The saved address; null while none exists yet (create screen). */
  current: string | null;
  publicOrigin: string | null;
  locked?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  large?: boolean;
  onEnter?: () => void;
  onStateChange?: (state: HandleCheck) => void;
}

export function AddressField({
  id,
  value,
  onChange,
  current,
  publicOrigin,
  locked = false,
  disabled = false,
  autoFocus = false,
  large = false,
  onEnter,
  onStateChange,
}: AddressFieldProps) {
  const state = useHandleCheck(value, current);
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const message = locked ? ADDRESS_LOCKED_MESSAGE : HANDLE_CHECK_MESSAGES[state];
  const messageId = `${id}-status`;
  const failed = !locked && (state === 'taken' || state === 'invalid' || state === 'reserved');

  return (
    <div>
      <Label htmlFor={id} className="sr-only">
        Adresse
      </Label>
      <div
        className={cn(
          'flex items-center rounded-lg border border-grey-200 dark:border-grey-700 bg-card transition-all focus-within:border-primary-500 focus-within:ring-[3px] focus-within:ring-ring/50',
          locked && 'bg-grey-50 dark:bg-grey-900'
        )}
      >
        <span
          className={cn(
            'shrink-0 select-none pl-4 pr-1 text-grey-500 dark:text-grey-400',
            large ? 'text-xl' : 'text-base'
          )}
        >
          {addressHost(publicOrigin)}/
        </span>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(normalizeHandleInput(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          placeholder="dein-name"
          readOnly={locked}
          disabled={disabled}
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={messageId}
          aria-invalid={failed || undefined}
          className={cn(
            'flex-1 min-w-0 bg-transparent text-foreground placeholder:text-grey-400 border-none outline-none px-2',
            large ? 'h-16 lg:h-[72px] text-xl lg:text-2xl' : 'h-11 text-base'
          )}
        />
      </div>
      <p
        id={messageId}
        role="status"
        className={cn(
          'mt-2 min-h-5 text-sm',
          failed
            ? 'text-red-700 dark:text-red-400'
            : state === 'available' && !locked
              ? 'text-primary-700 dark:text-primary-400'
              : 'text-grey-600 dark:text-grey-400'
        )}
      >
        {message}
      </p>
    </div>
  );
}
