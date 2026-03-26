import { Plus, X } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';

import { cn } from '../lib/cn';

import { pillBase, pillActive, pillInactive } from './pill-group';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface SettingsTagInputProps {
  items: string[];
  onChange: (items: string[]) => void;
  triggerLabel?: string;
  placeholder?: string;
  className?: string;
}

const SettingsTagInput: React.FC<SettingsTagInputProps> = React.memo(
  ({
    items,
    onChange,
    triggerLabel = 'Hinzufügen',
    placeholder = 'Eingabe + Enter...',
    className,
  }) => {
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleAdd = useCallback(() => {
      const trimmed = inputValue.trim();
      if (trimmed && !items.includes(trimmed)) {
        onChange([...items, trimmed]);
      }
      setInputValue('');
      inputRef.current?.focus();
    }, [inputValue, items, onChange]);

    const handleRemove = useCallback(
      (item: string) => {
        onChange(items.filter((i) => i !== item));
      },
      [items, onChange]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAdd();
        }
      },
      [handleAdd]
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              pillBase,
              items.length > 0 ? pillActive : pillInactive,
              'gap-1',
              className
            )}
          >
            <Plus className="size-3" />
            {triggerLabel}
            {items.length > 0 && <span className="text-[10px] opacity-70">({items.length})</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-64 p-2 bg-background-pure border border-grey-200 dark:border-grey-700 rounded-lg shadow-lg"
        >
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-md border border-grey-200 dark:border-grey-700 bg-transparent outline-none focus:border-primary-500 placeholder:text-grey-400"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!inputValue.trim()}
              className={cn(
                'shrink-0 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                inputValue.trim()
                  ? 'bg-primary-500 text-white hover:bg-primary-600'
                  : 'bg-grey-100 dark:bg-grey-800 text-grey-400 cursor-default'
              )}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {items.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {items.map((item) => (
                <span key={item} className={cn(pillBase, pillActive, 'py-1 px-2 text-[11px]')}>
                  {item}
                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    className="shrink-0 ml-0.5 rounded-full hover:bg-primary-500/20 p-0.5"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  }
);

SettingsTagInput.displayName = 'SettingsTagInput';

export { SettingsTagInput, type SettingsTagInputProps };
