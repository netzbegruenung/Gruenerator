import { memo, useState, useRef } from 'react';
import { FiPlus, FiArrowUp } from 'react-icons/fi';

interface AddCardButtonProps {
  onAdd: (name: string) => void;
}

export const AddCardButton = memo(function AddCardButton({ onAdd }: AddCardButtonProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Commit the typed title as a card. `keepOpen` leaves the composer focused so
  // several cards can be added in a row (Trello/Linear-style); blur closes it.
  const commit = (keepOpen: boolean) => {
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed);
      setValue('');
    }
    if (keepOpen) {
      inputRef.current?.focus();
    } else {
      setIsAdding(false);
    }
  };

  if (isAdding) {
    return (
      <div className="px-sm pb-sm flex items-center gap-xs">
        <input
          ref={inputRef}
          // autoFocus runs during commit, unlike a post-paint effect which the
          // DndContext DragOverlay portal / concurrent rendering can drop —
          // without focus the typed title never registers and Enter is a no-op.
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => commit(false)}
          onKeyDown={(e) => {
            // Stop the key from bubbling to the board's dnd-kit / shortcut layer
            // and keep the composer open so adding several cards feels responsive.
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              commit(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setValue('');
              setIsAdding(false);
            }
          }}
          placeholder="Kartentitel..."
          className="flex-1 min-w-0 rounded-md border border-grey-300 bg-background px-xs py-1 text-sm outline-none focus:border-primary-500 dark:border-grey-600"
        />
        <button
          type="button"
          // preventDefault on mousedown keeps focus on the input, so the click
          // isn't swallowed by the input's blur-then-close handler.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => commit(true)}
          disabled={!value.trim()}
          aria-label="Karte hinzufügen"
          className="flex items-center justify-center shrink-0 w-7 h-7 rounded-md border-none bg-primary-500 text-white cursor-pointer transition-colors hover:bg-primary-600 disabled:opacity-40 disabled:cursor-default"
        >
          <FiArrowUp size={15} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsAdding(true)}
      className="flex items-center gap-xs w-full px-sm py-sm sm:py-xs pb-md text-sm text-grey-500 hover:text-foreground bg-transparent border-none cursor-pointer rounded-b-md transition-colors"
    >
      <FiPlus size={14} />
      Karte hinzufügen
    </button>
  );
});
