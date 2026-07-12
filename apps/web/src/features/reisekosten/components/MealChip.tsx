export function MealChip({
  emoji,
  label,
  active,
  onClick,
}: {
  emoji: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-xs rounded-full border px-md py-xs text-sm font-medium transition-colors ${
        active
          ? 'border-primary bg-primary-50 text-primary-700 dark:bg-primary-900'
          : 'border-border text-muted-foreground hover:border-primary'
      }`}
    >
      <span className="text-base">{emoji}</span>
      {label}
    </button>
  );
}
