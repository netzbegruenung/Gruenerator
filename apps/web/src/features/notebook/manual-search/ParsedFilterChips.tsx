import { type ParsedFilterChip } from '@gruenerator/shared/utils';
import { FiX } from 'react-icons/fi';

/** Filters recognised in the typed query, each droppable with one click. */
export function ParsedFilterChips({
  chips,
  onDrop,
}: {
  chips: ParsedFilterChip[];
  onDrop: (key: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onDrop(chip.key)}
          aria-label={`Filter ${chip.label} entfernen`}
          className="flex items-center gap-1 rounded-full bg-[#FBE4F0] px-2.5 py-1 text-xs font-medium text-[#B4005C] transition-colors hover:bg-[#F5CFE2] dark:bg-[#3A1E2C] dark:text-[#F2A9CE]"
        >
          {chip.label}
          <FiX size={12} aria-hidden />
        </button>
      ))}
    </div>
  );
}
