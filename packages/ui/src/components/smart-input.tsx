import { Command as CommandPrimitive } from 'cmdk';
import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Popover, PopoverAnchor, PopoverContent } from './popover';

interface SmartInputOption {
  value: string;
  label: string;
  description?: string;
}

interface SmartInputProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SmartInputOption[];
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}

function SmartInput({
  value,
  onValueChange,
  options,
  placeholder = 'Suchen...',
  emptyMessage = 'Keine Ergebnisse',
  className,
  autoFocus,
  onSubmit,
}: SmartInputProps) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    if (!value.trim()) return options;
    const q = value.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q)
    );
  }, [value, options]);

  const handleSelect = React.useCallback(
    (selectedValue: string) => {
      const option = options.find((o) => o.value === selectedValue);
      if (option) {
        onValueChange(option.label);
        setOpen(false);
        if (onSubmit) onSubmit();
      }
    },
    [options, onValueChange, onSubmit]
  );

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn('relative', className)}>
          <CommandPrimitive shouldFilter={false}>
            <CommandPrimitive.Input
              ref={inputRef}
              value={value}
              onValueChange={(v) => {
                onValueChange(v);
                if (!open) setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onSubmit) {
                  e.preventDefault();
                  onSubmit();
                }
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder={placeholder}
              autoFocus={autoFocus}
              className="w-full rounded-lg border border-grey-200 bg-input-bg px-md py-sm text-sm text-foreground placeholder:text-grey-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 dark:border-grey-700"
            />
          </CommandPrimitive>
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <CommandPrimitive shouldFilter={false}>
          <CommandPrimitive.List className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 ? (
              <CommandPrimitive.Empty className="px-md py-sm text-sm text-grey-500">
                {emptyMessage}
              </CommandPrimitive.Empty>
            ) : (
              <CommandPrimitive.Group>
                {filtered.map((option) => (
                  <CommandPrimitive.Item
                    key={option.value}
                    value={option.value}
                    onSelect={handleSelect}
                    className="flex items-center gap-sm px-md py-sm text-sm cursor-pointer transition-colors data-[selected=true]:bg-background-alt"
                  >
                    <Check
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        value === option.label ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground">{option.label}</span>
                      {option.description && (
                        <span className="ml-1.5 text-xs text-grey-400">{option.description}</span>
                      )}
                    </div>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}

export { SmartInput, type SmartInputOption, type SmartInputProps };
