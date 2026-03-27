import { memo, useState, useRef, useEffect } from 'react';
import { FiPlus } from 'react-icons/fi';

interface AddCardButtonProps {
  onAdd: (name: string) => void;
}

export const AddCardButton = memo(function AddCardButton({ onAdd }: AddCardButtonProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding) inputRef.current?.focus();
  }, [isAdding]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onAdd(trimmed);
      setValue('');
    }
    setIsAdding(false);
  };

  if (isAdding) {
    return (
      <div className="px-sm pb-sm">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') {
              setValue('');
              setIsAdding(false);
            }
          }}
          placeholder="Kartentitel..."
          className="w-full rounded-md border border-grey-300 bg-background px-xs py-1 text-sm outline-none focus:border-primary-500 dark:border-grey-600"
        />
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
