import { STEPS } from '../constants';

export function Stepper({ step, onStep }: { step: number; onStep: (n: number) => void }) {
  return (
    <div className="flex items-start overflow-x-auto pb-xs">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <div key={label} className="flex flex-1 items-start">
            {i > 0 && (
              <span
                className={`mt-4 h-0.5 flex-1 rounded-full ${
                  i <= step ? 'bg-primary-300' : 'bg-border'
                }`}
              />
            )}
            <button
              type="button"
              onClick={() => onStep(i)}
              aria-current={current ? 'step' : undefined}
              className="flex max-w-[150px] flex-col items-center gap-xs px-sm text-center"
            >
              <span
                className={`flex size-9 flex-none items-center justify-center rounded-full text-sm font-bold transition-all ${
                  current
                    ? 'bg-primary text-white shadow-md'
                    : done
                      ? 'bg-primary-50 text-primary-700'
                      : 'bg-background-alt text-muted-foreground'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={`text-xs leading-tight ${
                  current
                    ? 'font-bold text-primary-700'
                    : done
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
