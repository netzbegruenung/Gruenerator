import { cn } from '@gruenerator/ui';

import { AGENTURA_TYPE_LABELS, AGENTURA_TYPE_VALUES, type AgenturaType } from '../lib/categories';

/**
 * Der Typ-Filter — quer zu den Regalen, nicht unter ihnen.
 *
 * Bewusst unauffällig: das Regal ist die Entscheidung, der Typ nur eine
 * Verengung darin. Zwei gleich laute Reihen übereinander lesen sich als zwei
 * Navigationen, und man sieht keiner mehr an, welche gerade greift.
 */
export function TypeFilterRow({
  active,
  onSelect,
}: {
  active: AgenturaType;
  onSelect: (type: AgenturaType) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Nach Art filtern"
      className="flex flex-wrap justify-center gap-0.5 max-sm:flex-nowrap max-sm:justify-start max-sm:overflow-x-auto"
    >
      {AGENTURA_TYPE_VALUES.map((type) => {
        const isActive = type === active;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(type)}
            className={cn(
              'h-[30px] shrink-0 rounded-full px-sm text-[13px] transition-colors',
              isActive
                ? 'bg-background-alt font-medium text-foreground'
                : 'text-foreground-muted hover:text-foreground'
            )}
          >
            {AGENTURA_TYPE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}
