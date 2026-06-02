import { SUGGESTED_AGENT_ICONS } from '@gruenerator/shared/agents';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from '@gruenerator/ui';
import { useEffect, useMemo, useState } from 'react';

import { AgentAvatar } from './AgentAvatar';
import { loadPhosphorModule, PhosphorIcon } from './PhosphorIcon';

import { cn } from '@/utils/cn';

interface IconPickerProps {
  value: string;
  onChange: (iconKey: string) => void;
  backgroundColor?: string;
}

const MAX_RESULTS = 120;

/**
 * Lets the user pick ANY react-icons Phosphor icon. The full set loads lazily
 * (only when the dialog first opens); an empty query shows the curated
 * suggestions, a query searches all icon names.
 */
export function IconPicker({ value, onChange, backgroundColor }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allNames, setAllNames] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open || allNames) return;
    let active = true;
    void loadPhosphorModule().then((mod) => {
      if (active)
        setAllNames(
          Object.keys(mod)
            .filter((k) => k.startsWith('Pi'))
            .sort()
        );
    });
    return () => {
      active = false;
    };
  }, [open, allNames]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...SUGGESTED_AGENT_ICONS];
    if (!allNames) return [];
    return allNames.filter((n) => n.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
  }, [query, allNames]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-sm rounded-lg border border-grey-300 p-sm text-left hover:bg-hover-alt dark:border-grey-700"
        >
          <AgentAvatar iconKey={value} backgroundColor={backgroundColor} size="lg" />
          <span className="text-sm font-medium text-primary-600 dark:text-primary-300">
            Icon ändern
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Icon wählen</DialogTitle>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Icons durchsuchen… (englisch, z.B. tree, chat, leaf)"
          autoFocus
        />
        <div className="grid max-h-[320px] grid-cols-8 gap-xs overflow-y-auto py-sm max-md:grid-cols-6">
          {results.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-md border',
                value === name
                  ? 'border-primary-600 bg-primary-600/10 text-primary-700 dark:text-primary-300'
                  : 'border-grey-200 hover:bg-hover-alt dark:border-grey-700'
              )}
            >
              <PhosphorIcon name={name} size={20} aria-hidden />
            </button>
          ))}
          {query && !allNames && (
            <span className="col-span-full text-sm text-foreground-muted">
              Icons werden geladen…
            </span>
          )}
          {query && allNames && results.length === 0 && (
            <span className="col-span-full text-sm text-foreground-muted">Keine Treffer.</span>
          )}
        </div>
        {!query && (
          <p className="text-xs text-foreground-muted">
            Tipp: Suche nach einem englischen Begriff, um alle Phosphor-Icons zu durchsuchen.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
