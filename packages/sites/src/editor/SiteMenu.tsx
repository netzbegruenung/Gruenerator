import { cn } from '@gruenerator/shared/utils';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import { Fragment, useRef, useState, type ReactNode, type RefObject } from 'react';
import { FiChevronDown } from 'react-icons/fi';

export interface SiteMenuEntry {
  key: string;
  label: string;
  /** Gets the menu trigger, for a dialog that should hand focus back to it. */
  onSelect: (trigger: HTMLElement | null) => void;
  destructive?: boolean;
  /** Has its own control in the desktop bar; only the phone menu lists it. */
  phoneOnly?: boolean;
  /** Starts a new group: a line before it. */
  separated?: boolean;
}

interface SiteMenuProps {
  title: string;
  /** Publishing state and address, heading the menu. */
  status?: { heading: string; detail: string | null };
  entries: SiteMenuEntry[];
  /** Phone only: beside the name (who else is here). */
  badge?: ReactNode;
  /** Phone only: under the heading of the sheet (who is here, what this role may do). */
  note?: ReactNode;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

const nameClass = 'truncate px-sm text-sm font-semibold text-foreground';

/**
 * The site name and everything about the site. On a desktop a dropdown under the name; on a phone
 * a sheet from the bottom, within thumb reach, that also takes what the narrow bar leaves out.
 * Without anything to offer, just the name.
 */
export function SiteMenu({ title, status, entries, badge, note, triggerRef }: SiteMenuProps) {
  const isMobile = useIsMobile();
  const ownRef = useRef<HTMLButtonElement>(null);
  const ref = triggerRef ?? ownRef;
  const [open, setOpen] = useState(false);
  // Runs once the sheet has closed, so a dialog it opens is not fighting the sheet for focus.
  const pending = useRef<SiteMenuEntry | null>(null);

  const shown = isMobile ? entries : entries.filter((entry) => !entry.phoneOnly);

  if (!isMobile) {
    if (shown.length === 0 && !status) return <span className={nameClass}>{title}</span>;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={ref} variant="ghost" size="sm" className="min-w-0 shrink font-semibold">
            <span className="truncate">{title}</span>
            <FiChevronDown className="text-grey-500" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-64">
          {status && (
            <DropdownMenuLabel className="font-normal">
              <span className="block font-semibold">{status.heading}</span>
              {status.detail && (
                <span className="block text-xs text-grey-600 dark:text-grey-400">
                  {status.detail}
                </span>
              )}
            </DropdownMenuLabel>
          )}
          {shown.map((entry) => (
            <Fragment key={entry.key}>
              {entry.separated && <DropdownMenuSeparator />}
              <DropdownMenuItem
                variant={entry.destructive ? 'destructive' : 'default'}
                onSelect={() => entry.onSelect(ref.current)}
              >
                {entry.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (shown.length === 0 && !status && !note) {
    return (
      <span className="flex min-w-0 items-center gap-xs">
        <span className={nameClass}>{title}</span>
        {badge}
      </span>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button ref={ref} variant="ghost" size="sm" className="min-w-0 shrink font-semibold">
          <span className="truncate">{title}</span>
          {badge}
          <FiChevronDown className="text-grey-500" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)]"
        onCloseAutoFocus={(e) => {
          const entry = pending.current;
          if (!entry) return;
          pending.current = null;
          e.preventDefault();
          entry.onSelect(ref.current);
        }}
      >
        <SheetHeader className="pr-12">
          <SheetTitle className="truncate text-lg">{title}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-col gap-0.5">
              {status && (
                <>
                  <span className="font-semibold text-foreground">{status.heading}</span>
                  {status.detail && <span className="truncate">{status.detail}</span>}
                </>
              )}
              {note}
            </div>
          </SheetDescription>
        </SheetHeader>
        <ul className="m-0 list-none px-sm pb-xs">
          {shown.map((entry) => (
            <li
              key={entry.key}
              className={cn(
                entry.separated && 'mt-xs border-t border-grey-200 pt-xs dark:border-grey-700'
              )}
            >
              <button
                type="button"
                onClick={() => {
                  pending.current = entry;
                  setOpen(false);
                }}
                className={cn(
                  'flex min-h-12 w-full items-center rounded-md px-sm text-left text-base hover:bg-grey-100 focus-visible:bg-grey-100 dark:hover:bg-grey-800 dark:focus-visible:bg-grey-800',
                  entry.destructive ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                )}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
