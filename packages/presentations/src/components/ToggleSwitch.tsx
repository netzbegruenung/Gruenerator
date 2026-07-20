export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  ariaLabel?: string;
}

/**
 * Design-kit toggle: a 40×22 pill track (Klee-green when on) with an 18px knob,
 * shown as a label + hint row. Matches the Präsentations-Editor design.
 */
export function ToggleSwitch({ checked, onChange, label, hint, ariaLabel }: ToggleSwitchProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[13.5px] font-bold text-[#1B2A22] dark:text-grey-100">{label}</span>
        {hint && <span className="text-xs text-[#6E7E74] dark:text-grey-400">{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        onClick={() => onChange(!checked)}
        className={`flex h-[22px] w-10 flex-none items-center rounded-full p-0.5 transition-colors ${
          checked ? 'justify-end bg-primary-600' : 'justify-start bg-[#CBD6CF] dark:bg-grey-600'
        }`}
      >
        <span className="block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]" />
      </button>
    </div>
  );
}
