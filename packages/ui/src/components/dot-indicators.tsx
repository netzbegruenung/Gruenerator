export function DotIndicators({
  count,
  activeIdx,
  onSelect,
}: {
  count: number;
  activeIdx: number;
  onSelect: (i: number) => void;
}) {
  if (count <= 1) return null;
  return (
    <div className="flex items-center gap-1 mt-sm">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`h-1.5 rounded-full border-none cursor-pointer transition-all ${
            i === activeIdx
              ? 'w-4 bg-primary-500'
              : 'w-1.5 bg-grey-300 dark:bg-grey-600 hover:bg-grey-400'
          }`}
        />
      ))}
    </div>
  );
}
